"""Статусы заказа и допустимые переходы (SPEC 10.5)."""

import pytest

from app.domain.errors import InvalidTransitionError
from app.domain.orders import (
    DeliveryMethod,
    OrderStatus,
    can_transition,
    customer_email_on,
    ensure_can_ship,
    ensure_transition,
    next_steps,
    status_label,
)

S = OrderStatus


class TestTransitions:
    @pytest.mark.parametrize(
        ("src", "dst"),
        [
            (S.AWAITING_PAYMENT, S.CANCELLED),
            (S.PAID, S.ASSEMBLING),
            (S.PAID, S.SHIPPED),
            (S.ASSEMBLING, S.SHIPPED),
            (S.SHIPPED, S.COMPLETED),
            (S.COMPLETED, S.REFUNDED),
            (S.ACCEPTED, S.ASSEMBLING),
            (S.NEEDS_ATTENTION, S.PAID),
            (S.NEEDS_ATTENTION, S.CANCELLED),
            (S.ASSEMBLING, S.PAID),  # шаг назад, если нажали по ошибке
            (S.SHIPPED, S.ASSEMBLING),
        ],
    )
    def test_allowed_for_admin(self, src: OrderStatus, dst: OrderStatus) -> None:
        assert can_transition(src, dst, by_system=False)

    @pytest.mark.parametrize(
        ("src", "dst"),
        [
            (S.COMPLETED, S.ASSEMBLING),
            (S.CANCELLED, S.ASSEMBLING),
            (S.REFUNDED, S.PAID),
            (S.AWAITING_PAYMENT, S.SHIPPED),
            (S.AWAITING_PAYMENT, S.COMPLETED),
            (S.PAID, S.PAID),
        ],
    )
    def test_forbidden(self, src: OrderStatus, dst: OrderStatus) -> None:
        assert not can_transition(src, dst, by_system=False)

    def test_admin_cannot_mark_paid_manually(self) -> None:
        # «Оплачен» ставится только по факту оплаты из банка
        assert not can_transition(S.AWAITING_PAYMENT, S.PAID, by_system=False)
        assert can_transition(S.AWAITING_PAYMENT, S.PAID, by_system=True)

    def test_late_payment_after_autocancel_is_system_only(self) -> None:
        assert can_transition(S.CANCELLED, S.PAID, by_system=True)
        assert can_transition(S.CANCELLED, S.NEEDS_ATTENTION, by_system=True)
        assert not can_transition(S.CANCELLED, S.PAID, by_system=False)

    def test_ensure_raises_human_message(self) -> None:
        with pytest.raises(InvalidTransitionError) as exc:
            ensure_transition(S.COMPLETED, S.ASSEMBLING, by_system=False)
        assert exc.value.message == "Нельзя перевести заказ из статуса «Выполнен» в «Собирается»"


class TestShipping:
    def test_cdek_requires_tracking(self) -> None:
        with pytest.raises(InvalidTransitionError, match="трек-номер"):
            ensure_can_ship(DeliveryMethod.CDEK_PVZ, tracking_number=None)
        with pytest.raises(InvalidTransitionError, match="трек-номер"):
            ensure_can_ship(DeliveryMethod.CDEK_DOOR, tracking_number="  ")
        ensure_can_ship(DeliveryMethod.CDEK_PVZ, tracking_number="1234567890")

    def test_courier_does_not_require_tracking(self) -> None:
        ensure_can_ship(DeliveryMethod.COURIER, tracking_number=None)
        ensure_can_ship(DeliveryMethod.PICKUP, tracking_number=None)


class TestLabels:
    def test_generic(self) -> None:
        assert status_label(S.PAID) == "Оплачен (новый)"
        assert status_label(S.AWAITING_PAYMENT) == "Ожидает оплаты"
        assert status_label(S.NEEDS_ATTENTION) == "Требует внимания"

    def test_pickup_shipped_reads_naturally(self) -> None:
        assert status_label(S.SHIPPED, DeliveryMethod.PICKUP) == "Готов к выдаче"
        assert status_label(S.SHIPPED, DeliveryMethod.CDEK_PVZ) == "Передан в доставку"


class TestNextSteps:
    def test_paid(self) -> None:
        steps = next_steps(S.PAID, DeliveryMethod.CDEK_PVZ)
        assert steps[0].to is S.ASSEMBLING
        assert steps[0].label == "Начать сборку"

    def test_assembling_cdek(self) -> None:
        steps = next_steps(S.ASSEMBLING, DeliveryMethod.CDEK_PVZ)
        assert steps[0].to is S.SHIPPED
        assert steps[0].label == "Собран → Передать в доставку"
        assert steps[0].needs_tracking

    def test_assembling_pickup(self) -> None:
        steps = next_steps(S.ASSEMBLING, DeliveryMethod.PICKUP)
        assert steps[0].label == "Собран → Готов к выдаче"
        assert not steps[0].needs_tracking

    def test_shipped(self) -> None:
        steps = next_steps(S.SHIPPED, DeliveryMethod.COURIER)
        assert steps[0].to is S.COMPLETED

    def test_terminal_has_no_steps(self) -> None:
        assert next_steps(S.REFUNDED, DeliveryMethod.COURIER) == []
        assert next_steps(S.AWAITING_PAYMENT, DeliveryMethod.COURIER) == []


class TestCustomerEmails:
    def test_which_statuses_email(self) -> None:
        assert customer_email_on(S.PAID, was_paid=True)
        assert customer_email_on(S.SHIPPED, was_paid=True)
        assert customer_email_on(S.COMPLETED, was_paid=True)
        assert customer_email_on(S.REFUNDED, was_paid=True)
        assert not customer_email_on(S.ASSEMBLING, was_paid=True)
        assert not customer_email_on(S.NEEDS_ATTENTION, was_paid=True)

    def test_cancel_emails_only_if_was_paid(self) -> None:
        assert customer_email_on(S.CANCELLED, was_paid=True)
        assert not customer_email_on(S.CANCELLED, was_paid=False)
