"""Оформление заказа (SPEC 4.2): одна страница → заказ с резервом → платёжная ссылка.

Порядок важен:
1. Всё пересчитывается на сервере тем же расчётом, что и корзина.
2. Заказ, резерв остатка и баллов — одной транзакцией, которая сразу фиксируется
   (чтобы не держать блокировки строк, пока ждём банк).
3. Платёжная ссылка создаётся отдельно; если банк не ответил — заказ отменяется,
   остаток и баллы возвращаются, корзина остаётся как была.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.contacts import normalize_email, normalize_phone
from app.domain.errors import (
    ConflictError,
    DomainError,
    ExternalServiceError,
    InsufficientStockError,
    NotFoundError,
)
from app.domain.money import format_rub
from app.domain.orders import DeliveryMethod, OrderStatus, PaymentMethod
from app.models import Customer, Order, OrderItem, PromoCodeUsage
from app.schemas.checkout import CheckoutIn
from app.services import cart as cart_service
from app.services import delivery as delivery_service
from app.services import orders as order_service
from app.services import payments
from app.services.settings import get_group
from app.services.settings_schema import PaymentSettings

CHECKOUT_LIMIT = 20
CHECKOUT_WINDOW = 600


@dataclass(frozen=True, slots=True)
class CheckoutResult:
    order: Order
    payment_url: str | None


async def _resolve_customer(
    db: AsyncSession,
    customer: Customer | None,
    *,
    email: str,
    name: str,
    phone: str,
    marketing_consent: bool,
) -> Customer:
    """Покупатель заказа: вошедший или найденный/созданный по email («тихая регистрация»)."""
    if customer is not None:
        if not customer.name:
            customer.name = name
        if not customer.phone:
            customer.phone = phone
        if customer.email is None:
            taken = await db.scalar(select(Customer.id).where(Customer.email == email))
            if taken is None:
                customer.email = email
        if marketing_consent:
            customer.marketing_consent = True
        return customer
    existing = await db.scalar(select(Customer).where(Customer.email == email))
    if existing is not None:
        if not existing.name:
            existing.name = name
        if not existing.phone:
            existing.phone = phone
        return existing
    created = Customer(email=email, name=name, phone=phone, marketing_consent=marketing_consent)
    db.add(created)
    await db.flush()
    return created


def _variant_label(line: cart_service.LineCalc) -> str:
    return "шт." if line.product.type == "unit" else line.label


async def place_order(
    db: AsyncSession,
    container: Container,
    payload: CheckoutIn,
    *,
    customer: Customer | None,
    cart_token: str | None,
    ip: str | None,
) -> CheckoutResult:
    await container.rate_limiter.hit(
        f"checkout:{ip}", limit=CHECKOUT_LIMIT, window_seconds=CHECKOUT_WINDOW
    )
    if not payload.consent_offer:
        raise DomainError("Подтвердите, что принимаете условия оферты", field="consent_offer")
    if not payload.consent_pd:
        raise DomainError(
            "Подтвердите согласие на обработку персональных данных", field="consent_pd"
        )
    name = " ".join(payload.name.split())
    phone = normalize_phone(payload.phone)
    email = normalize_email(payload.email)

    cart = await cart_service.find_cart(db, container, customer=customer, token=cart_token)
    if cart is None or not cart.items:
        raise DomainError("Корзина пуста")

    method = DeliveryMethod(payload.delivery.method)
    payment_method = PaymentMethod(payload.payment_method)
    payment_settings = await get_group(db, PaymentSettings)
    if payment_method is PaymentMethod.ON_DELIVERY and (
        not payment_settings.allow_pay_on_delivery
        or method not in (DeliveryMethod.PICKUP, DeliveryMethod.COURIER)
    ):
        raise DomainError(
            "Оплата при получении недоступна — оплатите заказ онлайн", field="payment_method"
        )

    calc = await cart_service.compute(db, container, cart, customer=customer, email=email)
    if calc.problems:
        raise InsufficientStockError(calc.problems[0])
    quote = await delivery_service.quote(
        db,
        container,
        payload.delivery,
        items_kop=calc.items_after_discounts_kop,
        weight_grams=calc.parcel_weight_grams,
    )
    total = calc.total_without_delivery_kop + quote.price_kop
    if payload.expected_total_kop is not None and payload.expected_total_kop != total:
        raise ConflictError(
            f"Сумма заказа изменилась: было {format_rub(payload.expected_total_kop)}, "
            f"стало {format_rub(total)}. Проверьте корзину и нажмите «Оплатить» ещё раз."
        )

    buyer = await _resolve_customer(
        db,
        customer,
        email=email,
        name=name,
        phone=phone,
        marketing_consent=payload.marketing_consent,
    )
    now = container.clock.now()
    online = payment_method is PaymentMethod.ONLINE
    ttl = container.settings.payment_ttl_minutes
    order = Order(
        customer_id=buyer.id,
        name=name,
        phone=phone,
        email=email,
        status=(OrderStatus.AWAITING_PAYMENT if online else OrderStatus.ACCEPTED).value,
        payment_method=payment_method.value,
        items_total_kop=calc.items_total_kop,
        product_discount_kop=calc.product_discount_kop,
        order_discount_kop=calc.order_discount_kop,
        order_discount_source=calc.order_discount_source.value
        if calc.order_discount_source
        else None,
        promo_code_id=calc.promo_code_id,
        promo_code_text=calc.promo.code if calc.promo and calc.promo.applied else None,
        points_spent=calc.points.applied,
        points_to_earn=calc.points_to_earn,
        delivery_kop=quote.price_kop,
        total_kop=total,
        discount_notes=calc.notes,
        delivery_method=method.value,
        delivery_data={k: v for k, v in quote.data.items() if v is not None},
        customer_comment=(payload.comment or "").strip() or None,
        reserved_until=now + timedelta(minutes=ttl) if online else None,
        consent_offer_at=now,
        consent_pd_at=now,
        created_at=now,
        history=[],
        payments=[],
        refunds=[],
    )
    order.items = [
        OrderItem(
            position=index,
            product_id=line.product.id,
            product_name=line.product.name,
            product_type=line.product.type,
            variant_kind=line.kind,
            grams=line.grams,
            qty=line.qty,
            variant_label=_variant_label(line),
            unit_price_kop=line.pack_price_kop,
            line_total_kop=line.line_total_kop,
            product_discount_kop=line.product_discount_kop,
            order_discount_kop=line.order_discount_kop,
            points_kop=line.points_kop,
            applied_promotion_title=line.promotion_title,
            receipt_amount_kop=line.receipt_amount_kop,
        )
        for index, line in enumerate(calc.lines)
    ]
    db.add(order)
    await db.flush()
    await db.refresh(order, ["number"])
    order_service.record_history(
        order, from_status=None, to_status=order.status, actor_type=order_service.CUSTOMER
    )
    await order_service.reserve_stock(db, container, order)
    await order_service.reserve_points(db, order)
    if calc.promo_code_id is not None:
        db.add(
            PromoCodeUsage(
                promo_code_id=calc.promo_code_id,
                customer_id=buyer.id,
                email=email,
                order_id=order.id,
                discount_kop=calc.order_discount_kop,
            )
        )
    order_id = order.id
    await db.commit()

    payment_url: str | None = None
    if online:
        try:
            payment = await payments.create_payment_link(db, container, order, ttl_minutes=ttl)
        except ExternalServiceError:
            await db.rollback()
            locked = await order_service.lock_order(db, order_id)
            await order_service.cancel_unpaid(
                db, container, locked, comment="Банк не ответил при создании ссылки на оплату"
            )
            await db.commit()
            raise
        payment_url = payment.payment_url
    else:
        await order_service.notify_new_order(db, container, order)
        order_service.email_customer(db, container, order, OrderStatus.ACCEPTED, was_paid=False)
        await container.kicker.kick("deliver_outbox")

    await cart_service.clear(db, cart)
    await db.commit()
    return CheckoutResult(order=order, payment_url=payment_url)


async def get_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Заказ не найден")
    return order
