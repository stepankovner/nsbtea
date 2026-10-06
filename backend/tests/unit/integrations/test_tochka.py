"""Клиент интернет-эквайринга Точки (см. docs/INTEGRATIONS.md)."""

import json
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app.integrations.payments import (
    PaymentGatewayError,
    PaymentRequest,
    PaymentStatus,
    ReceiptLine,
    WebhookSignatureError,
)
from app.integrations.tochka import TochkaGateway

BASE = "https://enter.tochka.com/sandbox/v2"


def make_request() -> PaymentRequest:
    return PaymentRequest(
        payment_link_id="NSB-10001-1",
        amount_kop=160_050,
        purpose="Заказ NSB-10001 в магазине НСБ Чай",
        redirect_url="https://nsbtea.ru/order/abc/result",
        fail_redirect_url="https://nsbtea.ru/order/abc/result?failed=1",
        ttl_minutes=30,
        client_email="buyer@mail.ru",
        client_name="Анна",
        client_phone="+79001234567",
        items=(
            ReceiptLine(name="Да Хун Пао, 100 г", amount_kop=125_050),
            ReceiptLine(name="Доставка", amount_kop=35_000, is_service=True),
        ),
        tax_system="usn_income",
        vat_type="none",
    )


class Recorder:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self.requests: list[httpx.Request] = []
        self._responses = responses

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self._responses.pop(0)


def gateway(recorder: Recorder, public_jwk: dict[str, Any] | None = None) -> TochkaGateway:
    return TochkaGateway(
        base_url=BASE,
        token="sandbox.jwt.token",
        customer_code="1234567ab",
        merchant_id="200000000001097",
        transport=httpx.MockTransport(recorder),
        public_jwk=public_jwk,
    )


async def test_create_payment_body() -> None:
    recorder = Recorder(
        [
            httpx.Response(
                200,
                json={
                    "Data": {
                        "operationId": "op-1",
                        "paymentLink": "https://merch.tochka.com/order/?uuid=op-1",
                        "status": "CREATED",
                    }
                },
            )
        ]
    )
    link = await gateway(recorder).create_payment(make_request())

    assert link.operation_id == "op-1"
    assert link.url == "https://merch.tochka.com/order/?uuid=op-1"
    request = recorder.requests[0]
    assert request.method == "POST"
    assert str(request.url) == f"{BASE}/acquiring/v1.0/payments_with_receipt"
    assert request.headers["authorization"] == "Bearer sandbox.jwt.token"
    data = json.loads(request.content)["Data"]
    assert data["customerCode"] == "1234567ab"
    assert data["merchantId"] == "200000000001097"
    assert data["amount"] == 1600.5
    assert data["paymentLinkId"] == "NSB-10001-1"
    assert data["ttl"] == 30
    assert data["paymentMode"] == ["card", "sbp"]
    assert data["taxSystemCode"] == "usn_income"
    assert data["redirectUrl"] == "https://nsbtea.ru/order/abc/result"
    assert data["Client"] == {"email": "buyer@mail.ru", "name": "Анна", "phone": "+79001234567"}
    assert data["Items"] == [
        {
            "name": "Да Хун Пао, 100 г",
            "amount": 1250.5,
            "quantity": 1,
            "vatType": "none",
            "paymentMethod": "full_prepayment",
            "paymentObject": "goods",
            "measure": "шт.",
        },
        {
            "name": "Доставка",
            "amount": 350.0,
            "quantity": 1,
            "vatType": "none",
            "paymentMethod": "full_prepayment",
            "paymentObject": "service",
            "measure": "шт.",
        },
    ]


async def test_create_payment_error_has_bank_message() -> None:
    recorder = Recorder(
        [
            httpx.Response(
                400,
                json={
                    "code": "400",
                    "message": "Bad Request",
                    "Errors": [{"errorCode": "x", "message": "Field merchantId is required"}],
                },
            )
        ]
    )
    with pytest.raises(PaymentGatewayError, match="merchantId is required"):
        await gateway(recorder).create_payment(make_request())


async def test_network_error() -> None:
    def broken(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("нет сети")

    gw = TochkaGateway(
        base_url=BASE,
        token="t",
        customer_code="1234567ab",
        merchant_id=None,
        transport=httpx.MockTransport(broken),
    )
    with pytest.raises(PaymentGatewayError):
        await gw.create_payment(make_request())


async def test_get_payment() -> None:
    recorder = Recorder(
        [
            httpx.Response(
                200,
                json={
                    "Data": {
                        "Operation": [
                            {
                                "operationId": "op-1",
                                "status": "APPROVED",
                                "amount": 1600.5,
                                "paymentLinkId": "NSB-10001-1",
                                "paidAt": "2026-10-05T12:00:00+03:00",
                            }
                        ]
                    }
                },
            )
        ]
    )
    info = await gateway(recorder).get_payment("op-1")
    assert str(recorder.requests[0].url) == f"{BASE}/acquiring/v1.0/payments/op-1"
    assert info.status is PaymentStatus.APPROVED
    assert info.amount_kop == 160_050
    assert info.payment_link_id == "NSB-10001-1"
    assert info.paid_at is not None


async def test_unknown_status_is_not_paid() -> None:
    recorder = Recorder(
        [
            httpx.Response(
                200,
                json={"Data": {"Operation": [{"operationId": "op", "status": "WEIRD", "amount": 1}]}},
            )
        ]
    )
    info = await gateway(recorder).get_payment("op")
    assert info.status is PaymentStatus.UNKNOWN
    assert not info.status.is_paid


async def test_refund() -> None:
    recorder = Recorder(
        [httpx.Response(200, json={"Data": {"isRefund": True, "orderId": "r-1", "amount": 100}})]
    )
    result = await gateway(recorder).refund("op-1", 10_000)
    request = recorder.requests[0]
    assert str(request.url) == f"{BASE}/acquiring/v1.0/payments/op-1/refund"
    assert json.loads(request.content) == {"Data": {"amount": 100.0}}
    assert result.refund_id == "r-1"


async def test_refund_rejected() -> None:
    recorder = Recorder([httpx.Response(200, json={"Data": {"isRefund": False}})])
    with pytest.raises(PaymentGatewayError):
        await gateway(recorder).refund("op-1", 10_000)


class TestWebhook:
    @pytest.fixture
    def keypair(self) -> tuple[rsa.RSAPrivateKey, dict[str, Any]]:
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_jwk = json.loads(RSAAlgorithm.to_jwk(private.public_key()))
        return private, public_jwk

    async def test_valid_signature(self, keypair: tuple[rsa.RSAPrivateKey, dict[str, Any]]) -> None:
        private, public_jwk = keypair
        payload = {
            "webhookType": "acquiringInternetPayment",
            "customerCode": "1234567ab",
            "amount": "1600.50",
            "paymentType": "card",
            "operationId": "op-1",
            "status": "APPROVED",
            "paymentLinkId": "NSB-10001-1",
        }
        body = jwt.encode(payload, private, algorithm="RS256").encode()
        notice = await gateway(Recorder([]), public_jwk).parse_webhook(body)
        assert notice.operation_id == "op-1"
        assert notice.payment_link_id == "NSB-10001-1"
        assert notice.status is PaymentStatus.APPROVED

    async def test_forged_signature(self, keypair: tuple[rsa.RSAPrivateKey, dict[str, Any]]) -> None:
        _, public_jwk = keypair
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        body = jwt.encode({"operationId": "op-1", "status": "APPROVED"}, other, algorithm="RS256")
        with pytest.raises(WebhookSignatureError):
            await gateway(Recorder([]), public_jwk).parse_webhook(body.encode())

    async def test_hs256_downgrade_rejected(
        self, keypair: tuple[rsa.RSAPrivateKey, dict[str, Any]]
    ) -> None:
        _, public_jwk = keypair
        body = jwt.encode({"operationId": "op-1"}, "secret", algorithm="HS256")
        with pytest.raises(WebhookSignatureError):
            await gateway(Recorder([]), public_jwk).parse_webhook(body.encode())

    async def test_garbage(self, keypair: tuple[rsa.RSAPrivateKey, dict[str, Any]]) -> None:
        _, public_jwk = keypair
        with pytest.raises(WebhookSignatureError):
            await gateway(Recorder([]), public_jwk).parse_webhook(b"not a jwt")

    async def test_public_key_is_fetched_once(
        self, keypair: tuple[rsa.RSAPrivateKey, dict[str, Any]]
    ) -> None:
        private, public_jwk = keypair
        recorder = Recorder([httpx.Response(200, json=public_jwk)])
        gw = gateway(recorder)
        body = jwt.encode({"operationId": "op-1", "status": "APPROVED"}, private, algorithm="RS256")
        await gw.parse_webhook(body.encode())
        await gw.parse_webhook(body.encode())
        assert len(recorder.requests) == 1
        assert "keys/public" in str(recorder.requests[0].url)
