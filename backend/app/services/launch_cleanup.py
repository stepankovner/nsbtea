"""Очистка тестовых данных перед запуском (ROADMAP, M6) — только для тестового сервера.

Удаляются пробные заказы (с оплатами, возвратами, историей статусов), покупатели (с баллами,
адресами, избранным, корзинами), коды входа, письма и уведомления в очереди, записи вебхуков,
заявки (по желанию). Остаются товары, категории, фото, тексты, события, настройки, сотрудники,
акции, промокоды и поставки.

Остатки возвращаются так, будто пробных заказов не было: по каждому товару считается, сколько
ушло в заказы и не вернулось (продажи минус отмены и возвраты), и это количество возвращается
одной строкой журнала движений (CLAUDE.md, правило 3) — баланс по-прежнему равен сумме журнала.
"""

from dataclasses import dataclass, field

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.inventory import MovementReason
from app.models import (
    Application,
    Cart,
    Customer,
    InventoryMovement,
    LoginCode,
    Order,
    OutboxMessage,
    WebhookEvent,
)
from app.services import audit
from app.services.inventory import change_stock

RESTOCK_COMMENT = "Возврат остатка тестовых заказов (очистка перед запуском)"


@dataclass(slots=True)
class CleanupReport:
    orders: int = 0
    customers: int = 0
    applications: int = 0
    restocked: dict[str, int] = field(default_factory=dict)


async def _count(db: AsyncSession, model: type) -> int:
    return int(await db.scalar(select(func.count()).select_from(model)) or 0)


async def clear_test_data(
    db: AsyncSession, container: Container, *, keep_applications: bool = False
) -> CleanupReport:
    report = CleanupReport(
        orders=await _count(db, Order),
        customers=await _count(db, Customer),
        applications=0 if keep_applications else await _count(db, Application),
    )

    # 1. остатки — до удаления заказов, пока движения ещё связаны с ними
    taken = await db.execute(
        select(InventoryMovement.product_id, func.sum(InventoryMovement.delta))
        .where(InventoryMovement.order_id.is_not(None))
        .group_by(InventoryMovement.product_id)
    )
    for product_id, net in taken.all():
        if net < 0:
            movement = await change_stock(
                db, container, product_id, -net, MovementReason.ADJUSTMENT, comment=RESTOCK_COMMENT
            )
            report.restocked[movement.product.name] = -net

    # 2. заказы и покупатели; связанные строки удаляет база (ON DELETE CASCADE)
    for model in (Order, Customer, Cart, LoginCode, OutboxMessage, WebhookEvent):
        await db.execute(delete(model).execution_options(synchronize_session=False))
    if not keep_applications:
        await db.execute(delete(Application).execution_options(synchronize_session=False))

    returned = ", ".join(f"{name} +{qty}" for name, qty in report.restocked.items()) or "нет"
    await audit.record(
        db,
        None,
        action="system.clear_test_data",
        entity="system",
        summary=(
            f"Очистка тестовых данных перед запуском: заказов {report.orders}, "
            f"покупателей {report.customers}, заявок {report.applications}; "
            f"возвращено на склад: {returned}"
        ),
    )
    return report
