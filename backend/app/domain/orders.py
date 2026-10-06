"""Статусы заказа и переходы между ними (SPEC 10.5).

Частичный возврат не меняет статус выполнения — он отражается суммой возвратов
у заказа (см. DECISIONS.md). Полный возврат переводит заказ в «Возврат».
"""

from dataclasses import dataclass
from enum import StrEnum

from app.domain.errors import InvalidTransitionError


class OrderStatus(StrEnum):
    AWAITING_PAYMENT = "awaiting_payment"
    ACCEPTED = "accepted"  # оплата при получении (если включена в настройках)
    PAID = "paid"
    ASSEMBLING = "assembling"
    SHIPPED = "shipped"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    NEEDS_ATTENTION = "needs_attention"


class DeliveryMethod(StrEnum):
    CDEK_PVZ = "cdek_pvz"
    CDEK_DOOR = "cdek_door"
    COURIER = "courier"
    PICKUP = "pickup"


class PaymentMethod(StrEnum):
    ONLINE = "online"
    ON_DELIVERY = "on_delivery"


DELIVERY_LABELS: dict[DeliveryMethod, str] = {
    DeliveryMethod.CDEK_PVZ: "СДЭК — пункт выдачи",
    DeliveryMethod.CDEK_DOOR: "СДЭК — курьер до двери",
    DeliveryMethod.COURIER: "Курьер по Владимиру",
    DeliveryMethod.PICKUP: "Самовывоз во Владимире",
}

STATUS_LABELS: dict[OrderStatus, str] = {
    OrderStatus.AWAITING_PAYMENT: "Ожидает оплаты",
    OrderStatus.ACCEPTED: "Новый (оплата при получении)",
    OrderStatus.PAID: "Оплачен (новый)",
    OrderStatus.ASSEMBLING: "Собирается",
    OrderStatus.SHIPPED: "Передан в доставку",
    OrderStatus.COMPLETED: "Выполнен",
    OrderStatus.CANCELLED: "Отменён",
    OrderStatus.REFUNDED: "Возврат",
    OrderStatus.NEEDS_ATTENTION: "Требует внимания",
}

S = OrderStatus

_ADMIN_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    S.AWAITING_PAYMENT: frozenset({S.CANCELLED}),
    S.ACCEPTED: frozenset({S.ASSEMBLING, S.SHIPPED, S.COMPLETED, S.CANCELLED}),
    S.PAID: frozenset({S.ASSEMBLING, S.SHIPPED, S.CANCELLED}),
    S.ASSEMBLING: frozenset({S.SHIPPED, S.PAID, S.CANCELLED}),
    S.SHIPPED: frozenset({S.COMPLETED, S.ASSEMBLING, S.REFUNDED}),
    S.COMPLETED: frozenset({S.REFUNDED}),
    S.NEEDS_ATTENTION: frozenset({S.PAID, S.CANCELLED, S.REFUNDED}),
    S.CANCELLED: frozenset(),
    S.REFUNDED: frozenset(),
}

_SYSTEM_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    S.AWAITING_PAYMENT: frozenset({S.PAID, S.CANCELLED, S.NEEDS_ATTENTION}),
    S.CANCELLED: frozenset({S.PAID, S.NEEDS_ATTENTION}),  # оплата пришла после автоотмены
    S.SHIPPED: frozenset({S.COMPLETED}),  # автозавершение через N дней
    S.PAID: frozenset({S.NEEDS_ATTENTION}),
}


def can_transition(src: OrderStatus, dst: OrderStatus, *, by_system: bool) -> bool:
    if src == dst:
        return False
    allowed = _ADMIN_TRANSITIONS.get(src, frozenset())
    if by_system:
        allowed = allowed | _SYSTEM_TRANSITIONS.get(src, frozenset())
    return dst in allowed


def ensure_transition(src: OrderStatus, dst: OrderStatus, *, by_system: bool) -> None:
    if not can_transition(src, dst, by_system=by_system):
        raise InvalidTransitionError(
            f"Нельзя перевести заказ из статуса «{STATUS_LABELS[src]}» в «{STATUS_LABELS[dst]}»"
        )


def needs_tracking(method: DeliveryMethod) -> bool:
    return method in (DeliveryMethod.CDEK_PVZ, DeliveryMethod.CDEK_DOOR)


def ensure_can_ship(method: DeliveryMethod, *, tracking_number: str | None) -> None:
    if needs_tracking(method) and not (tracking_number or "").strip():
        raise InvalidTransitionError(
            "Укажите трек-номер СДЭК — клиент получит его в письме", field="tracking_number"
        )


def status_label(status: OrderStatus, method: DeliveryMethod | None = None) -> str:
    if status is S.SHIPPED and method is DeliveryMethod.PICKUP:
        return "Готов к выдаче"
    if status is S.SHIPPED and method is DeliveryMethod.COURIER:
        return "Передан курьеру"
    return STATUS_LABELS[status]


@dataclass(frozen=True, slots=True)
class NextStep:
    to: OrderStatus
    label: str
    needs_tracking: bool = False


def next_steps(status: OrderStatus, method: DeliveryMethod) -> list[NextStep]:
    """Крупные кнопки «следующего шага» для карточки заказа в админке."""
    if status in (S.PAID, S.ACCEPTED):
        return [NextStep(S.ASSEMBLING, "Начать сборку")]
    if status is S.ASSEMBLING:
        if method is DeliveryMethod.PICKUP:
            return [NextStep(S.SHIPPED, "Собран → Готов к выдаче")]
        if method is DeliveryMethod.COURIER:
            return [NextStep(S.SHIPPED, "Собран → Передать курьеру")]
        return [NextStep(S.SHIPPED, "Собран → Передать в доставку", needs_tracking=True)]
    if status is S.SHIPPED:
        return [NextStep(S.COMPLETED, "Клиент получил → Выполнен")]
    if status is S.NEEDS_ATTENTION:
        return [NextStep(S.PAID, "Проблема решена → Вернуть в работу")]
    return []


def customer_email_on(status: OrderStatus, *, was_paid: bool) -> bool:
    if status is S.CANCELLED:
        return was_paid
    return status in (S.PAID, S.ACCEPTED, S.SHIPPED, S.COMPLETED, S.REFUNDED)


ACTIVE_STATUSES = frozenset({S.PAID, S.ACCEPTED, S.ASSEMBLING, S.SHIPPED, S.NEEDS_ATTENTION})
REVENUE_STATUSES = frozenset({S.PAID, S.ASSEMBLING, S.SHIPPED, S.COMPLETED})
