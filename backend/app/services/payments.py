"""Оплата через Точку (SPEC 5): платёжная ссылка с чеком, вебхук, сверка, поздняя оплата.

Статусу из вебхука не доверяем — всегда перепроверяем запросом в API банка.
Обработка идемпотентна: повторные вебхуки и сверки ничего не дублируют.
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import (
    ConflictError,
    DomainError,
    ExternalServiceError,
    InsufficientStockError,
)
from app.domain.orders import OrderStatus
from app.domain.receipt import DELIVERY_ITEM_NAME
from app.integrations.payments import (
    PaymentGatewayError,
    PaymentInfo,
    PaymentRequest,
    ReceiptLine,
    WebhookSignatureError,
)
from app.models import Customer, Order, Payment, WebhookEvent
from app.services import orders as order_service
from app.services.points import NotEnoughPointsError
from app.services.settings import get_group
from app.services.settings_schema import PaymentSettings

logger = logging.getLogger(__name__)


class BadWebhookError(DomainError):
    code = "bad_webhook"
    http_status = 400


PROVIDER = "tochka"
BANK_UNAVAILABLE = (
    "Не удалось связаться с банком. Попробуйте ещё раз через минуту — товары в корзине сохранены."
)


def _receipt_lines(order: Order) -> tuple[ReceiptLine, ...]:
    lines = [
        ReceiptLine(
            name=order_service.item_line(i.product_name, i.variant_label, i.qty, i.product_type),
            amount_kop=i.receipt_amount_kop,
        )
        for i in order.items
        if i.receipt_amount_kop > 0
    ]
    if order.delivery_kop > 0:
        lines.append(
            ReceiptLine(name=DELIVERY_ITEM_NAME, amount_kop=order.delivery_kop, is_service=True)
        )
    return tuple(lines)


async def create_payment_link(
    db: AsyncSession, container: Container, order: Order, *, ttl_minutes: int
) -> Payment:
    settings = await get_group(db, PaymentSettings)
    base = container.settings.public_base_url.rstrip("/")
    link_id = f"{order.display_number}-{len(order.payments) + 1}"
    request = PaymentRequest(
        payment_link_id=link_id,
        amount_kop=order.total_kop,
        purpose=f"Заказ {order.display_number} в магазине «НСБ Чай»",
        redirect_url=f"{base}/order/{order.id}/result",
        fail_redirect_url=f"{base}/order/{order.id}/result?failed=1",
        ttl_minutes=max(1, ttl_minutes),
        client_email=order.email,
        client_name=order.name,
        client_phone=order.phone,
        items=_receipt_lines(order),
        tax_system=settings.tax_system,
        vat_type=settings.vat_type,
    )
    try:
        link = await container.payments.create_payment(request)
    except PaymentGatewayError as exc:
        logger.error("Не удалось создать платёжную ссылку для %s: %s", order.display_number, exc)
        raise ExternalServiceError(BANK_UNAVAILABLE) from exc
    payment = Payment(
        order_id=order.id,
        provider=PROVIDER,
        payment_link_id=link_id,
        operation_id=link.operation_id,
        payment_url=link.url,
        amount_kop=order.total_kop,
        expires_at=container.clock.now() + timedelta(minutes=ttl_minutes),
    )
    order.payments.append(payment)
    await db.flush()
    return payment


async def _rereserve_after_cancel(
    db: AsyncSession, container: Container, order: Order
) -> str | None:
    """Оплата пришла после автоотмены. Пытаемся вернуть резерв; иначе — причина для владельца."""
    try:
        async with db.begin_nested():
            await order_service.reserve_stock(db, container, order)
            await order_service.reserve_points(db, order)
    except InsufficientStockError as exc:
        return (
            f"Оплата пришла после автоотмены, а товара уже не хватает ({exc.message}). "
            "Верните деньги или договоритесь с покупателем."
        )
    except NotEnoughPointsError:
        return (
            "Оплата пришла после автоотмены, но баллы покупателя уже потрачены. "
            "Проверьте заказ и свяжитесь с покупателем."
        )
    return None


async def confirm_paid(
    db: AsyncSession, container: Container, order: Order, payment: Payment, info: PaymentInfo
) -> bool:
    """Отметить заказ оплаченным. Возвращает True, если статус изменился."""
    payment.status = info.status.value
    payment.raw = info.raw or payment.raw
    if payment.paid_at is None:
        payment.paid_at = info.paid_at or container.clock.now()
    status = OrderStatus(order.status)
    if status is OrderStatus.AWAITING_PAYMENT:
        await order_service.set_status(
            db, container, order, OrderStatus.PAID, by_system=True, comment="Оплата через Точку"
        )
    elif status is OrderStatus.CANCELLED and order.paid_at is None:
        problem = await _rereserve_after_cancel(db, container, order)
        if problem is None:
            await order_service.set_status(
                db,
                container,
                order,
                OrderStatus.PAID,
                by_system=True,
                comment="Оплата пришла после автоотмены — резерв восстановлен",
            )
        else:
            order.paid_at = container.clock.now()
            await order_service.set_status(
                db, container, order, OrderStatus.NEEDS_ATTENTION, by_system=True, comment=problem
            )
            await order_service.notify_attention(db, container, order, problem)
            return True
    else:
        return False  # уже оплачен или обработан — повтор ничего не меняет

    if order.customer_id:
        customer = await db.get(Customer, order.customer_id)
        if customer is not None and customer.first_paid_order_at is None:
            customer.first_paid_order_at = order.paid_at
    await order_service.notify_new_order(db, container, order)
    order_service.email_customer(db, container, order, OrderStatus.PAID, was_paid=True)
    await container.kicker.kick("deliver_outbox")
    return True


async def refresh_order_payment(db: AsyncSession, container: Container, order: Order) -> bool:
    """Сверить платежи заказа с банком. True — если заказ оплачен (сейчас или раньше)."""
    for payment in order.payments:
        if not payment.operation_id:
            continue
        try:
            info = await container.payments.get_payment(payment.operation_id)
        except PaymentGatewayError as exc:
            logger.warning("Сверка %s: банк не ответил: %s", order.display_number, exc)
            continue
        if info.status.is_paid:
            await confirm_paid(db, container, order, payment, info)
            return True
        payment.status = info.status.value
    return False


async def handle_webhook(db: AsyncSession, container: Container, body: bytes) -> None:
    try:
        notice = await container.payments.parse_webhook(body)
    except WebhookSignatureError as exc:
        logger.warning("Отклонён вебхук Точки: %s", exc)
        raise BadWebhookError("Некорректный вебхук") from exc

    payment = await db.scalar(select(Payment).where(Payment.operation_id == notice.operation_id))
    event_key = f"{notice.operation_id}:{notice.status.value}"
    # журнал вебхуков; повторы не дублируются, но и не мешают перепроверке —
    # обработка сама по себе идемпотентна (см. confirm_paid)
    if not await db.scalar(
        select(WebhookEvent.id).where(
            WebhookEvent.provider == PROVIDER, WebhookEvent.external_id == event_key
        )
    ):
        try:
            async with db.begin_nested():
                db.add(
                    WebhookEvent(
                        provider=PROVIDER,
                        external_id=event_key,
                        payload=notice.raw,
                        processed_at=container.clock.now(),
                    )
                )
        except IntegrityError:
            pass  # параллельный такой же вебхук уже записан
    if payment is None:
        logger.warning("Вебхук по неизвестной операции %s", notice.operation_id)
        return
    order = await order_service.lock_order(db, payment.order_id)
    if order.paid_at is None:
        await refresh_order_payment(db, container, order)


async def retry_payment(db: AsyncSession, container: Container, order: Order) -> Payment:
    now = container.clock.now()
    if order.status != OrderStatus.AWAITING_PAYMENT.value:
        if order.status == OrderStatus.CANCELLED.value:
            raise ConflictError("Время на оплату истекло — оформите заказ заново")
        raise ConflictError("Заказ уже оплачен или обработан")
    if order.reserved_until is None or order.reserved_until <= now:
        raise ConflictError("Время на оплату истекло — оформите заказ заново")
    if await refresh_order_payment(db, container, order):
        raise ConflictError("Заказ уже оплачен")
    remaining = int((order.reserved_until - now).total_seconds() // 60)
    return await create_payment_link(db, container, order, ttl_minutes=max(1, remaining))
