"""Платёжный шлюз: общий интерфейс и заглушка для разработки/тестов.

Боевая реализация — integrations/tochka.py.
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol

from app.core.clock import Clock


class PaymentStatus(StrEnum):
    CREATED = "CREATED"
    APPROVED = "APPROVED"
    AUTHORIZED = "AUTHORIZED"
    EXPIRED = "EXPIRED"
    ON_REFUND = "ON-REFUND"
    REFUNDED = "REFUNDED"
    REFUNDED_PARTIALLY = "REFUNDED_PARTIALLY"
    WAIT_FULL_PAYMENT = "WAIT_FULL_PAYMENT"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def parse(cls, value: str | None) -> "PaymentStatus":
        try:
            return cls(value or "")
        except ValueError:
            return cls.UNKNOWN

    @property
    def is_paid(self) -> bool:
        return self in (PaymentStatus.APPROVED, PaymentStatus.REFUNDED_PARTIALLY)


@dataclass(frozen=True, slots=True)
class ReceiptLine:
    name: str
    amount_kop: int
    quantity: int = 1
    is_service: bool = False


@dataclass(frozen=True, slots=True)
class PaymentRequest:
    payment_link_id: str
    amount_kop: int
    purpose: str
    redirect_url: str
    fail_redirect_url: str
    ttl_minutes: int
    client_email: str
    client_name: str
    client_phone: str
    items: tuple[ReceiptLine, ...]
    tax_system: str
    vat_type: str


@dataclass(frozen=True, slots=True)
class PaymentLink:
    operation_id: str
    url: str


@dataclass(frozen=True, slots=True)
class PaymentInfo:
    operation_id: str
    status: PaymentStatus
    amount_kop: int
    payment_link_id: str | None = None
    paid_at: datetime | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class WebhookNotice:
    """Что пришло во вебхуке. Доверять статусу нельзя — его перепроверяем запросом в API."""

    operation_id: str
    payment_link_id: str | None
    status: PaymentStatus
    raw: dict[str, Any]


@dataclass(frozen=True, slots=True)
class RefundResult:
    refund_id: str | None
    raw: dict[str, Any]


class PaymentGatewayError(Exception):
    """Сбой связи или ответа банка. Текст — для журнала, не для покупателя."""


class WebhookSignatureError(Exception):
    pass


class PaymentGateway(Protocol):
    async def create_payment(self, request: PaymentRequest) -> PaymentLink: ...

    async def get_payment(self, operation_id: str) -> PaymentInfo: ...

    async def refund(self, operation_id: str, amount_kop: int) -> RefundResult: ...

    async def parse_webhook(self, body: bytes) -> WebhookNotice: ...


@dataclass(slots=True)
class _FakePayment:
    request: PaymentRequest
    status: PaymentStatus = PaymentStatus.CREATED
    refunded_kop: int = 0
    paid_at: datetime | None = None


class FakePaymentGateway:
    """Платежи «понарошку»: ссылка ведёт на страницу-заглушку, оплата — кнопкой."""

    def __init__(self, clock: Clock, public_base_url: str) -> None:
        self._clock = clock
        self._base = public_base_url.rstrip("/")
        self.payments: dict[str, _FakePayment] = {}
        self.fail_next_create = False

    async def create_payment(self, request: PaymentRequest) -> PaymentLink:
        if self.fail_next_create:
            self.fail_next_create = False
            raise PaymentGatewayError("Банк недоступен (тестовая ошибка)")
        operation_id = str(uuid.uuid4())
        self.payments[operation_id] = _FakePayment(request=request)
        return PaymentLink(
            operation_id=operation_id, url=f"{self._base}/api/dev/fake-pay/{operation_id}"
        )

    def mark_paid(self, operation_id: str) -> None:
        payment = self.payments[operation_id]
        payment.status = PaymentStatus.APPROVED
        payment.paid_at = self._clock.now()

    def mark_expired(self, operation_id: str) -> None:
        self.payments[operation_id].status = PaymentStatus.EXPIRED

    async def get_payment(self, operation_id: str) -> PaymentInfo:
        payment = self.payments.get(operation_id)
        if payment is None:
            raise PaymentGatewayError(f"операция {operation_id} не найдена")
        return PaymentInfo(
            operation_id=operation_id,
            status=payment.status,
            amount_kop=payment.request.amount_kop,
            payment_link_id=payment.request.payment_link_id,
            paid_at=payment.paid_at,
        )

    async def refund(self, operation_id: str, amount_kop: int) -> RefundResult:
        payment = self.payments[operation_id]
        if payment.status not in (PaymentStatus.APPROVED, PaymentStatus.REFUNDED_PARTIALLY):
            raise PaymentGatewayError("Возврат возможен только для оплаченного платежа")
        if payment.refunded_kop + amount_kop > payment.request.amount_kop:
            raise PaymentGatewayError("Сумма возврата больше оплаченной")
        payment.refunded_kop += amount_kop
        payment.status = (
            PaymentStatus.REFUNDED
            if payment.refunded_kop == payment.request.amount_kop
            else PaymentStatus.REFUNDED_PARTIALLY
        )
        return RefundResult(refund_id=str(uuid.uuid4()), raw={"amount_kop": amount_kop})

    async def parse_webhook(self, body: bytes) -> WebhookNotice:
        try:
            data = json.loads(body)
            operation_id = str(data["operationId"])
        except (ValueError, KeyError) as exc:
            raise WebhookSignatureError("некорректное тело вебхука") from exc
        return WebhookNotice(
            operation_id=operation_id,
            payment_link_id=data.get("paymentLinkId"),
            status=PaymentStatus.parse(data.get("status")),
            raw=data,
        )
