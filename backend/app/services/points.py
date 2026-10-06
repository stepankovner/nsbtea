"""Журнал баллов (CLAUDE.md, правило 4): баланс меняется только записью в журнал,
кэш `customers.points_balance` — атомарным UPDATE в той же транзакции."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import DomainError
from app.domain.loyalty import PointsKind
from app.models import AdminUser, Customer, Order, PointsTransaction

PENDING_STATUSES = ("paid", "accepted", "assembling", "shipped")


class NotEnoughPointsError(DomainError):
    code = "not_enough_points"
    http_status = 409


async def apply_points(
    db: AsyncSession,
    customer_id: uuid.UUID,
    delta: int,
    kind: PointsKind,
    *,
    order_id: uuid.UUID | None = None,
    comment: str | None = None,
    actor: AdminUser | None = None,
) -> PointsTransaction:
    if delta == 0:
        raise DomainError("Количество баллов не может быть нулевым")
    statement = (
        update(Customer)
        .where(Customer.id == customer_id, Customer.points_balance + delta >= 0)
        .values(points_balance=Customer.points_balance + delta)
        .returning(Customer.points_balance)
    )
    balance = (await db.execute(statement)).scalar_one_or_none()
    if balance is None:
        current = await db.scalar(select(Customer.points_balance).where(Customer.id == customer_id))
        if current is None:
            raise DomainError("Клиент не найден")
        raise NotEnoughPointsError(f"Недостаточно баллов: на счёте {current}, нужно {-delta}")
    customer = await db.get(Customer, customer_id)
    if customer is not None:
        customer.points_balance = balance  # синхронизируем объект в сессии
    entry = PointsTransaction(
        customer_id=customer_id,
        delta=delta,
        kind=kind.value,
        balance_after=balance,
        order_id=order_id,
        comment=comment,
        actor_id=actor.id if actor else None,
    )
    db.add(entry)
    return entry


async def pending_points(db: AsyncSession, customer_id: uuid.UUID) -> int:
    value = await db.scalar(
        select(func.coalesce(func.sum(Order.points_to_earn), 0)).where(
            Order.customer_id == customer_id,
            Order.status.in_(PENDING_STATUSES),
            Order.points_earned == 0,
        )
    )
    return int(value or 0)


async def ledger_balance(db: AsyncSession, customer_id: uuid.UUID) -> int:
    """Баланс по журналу — для сверки с кэшем."""
    value = await db.scalar(
        select(func.coalesce(func.sum(PointsTransaction.delta), 0)).where(
            PointsTransaction.customer_id == customer_id
        )
    )
    return int(value or 0)
