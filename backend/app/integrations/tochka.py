"""Интернет-эквайринг Точки: платёжные ссылки с чеком, статус, возврат, вебхук.

Справка по API — docs/INTEGRATIONS.md. Суммы в API — рубли (число), у нас — копейки.
"""

import asyncio
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.config import IntegrationMode, Settings
from app.integrations.payments import (
    PaymentGatewayError,
    PaymentInfo,
    PaymentLink,
    PaymentRequest,
    PaymentStatus,
    RefundResult,
    WebhookNotice,
    WebhookSignatureError,
)

logger = logging.getLogger(__name__)

PRODUCTION_URL = "https://enter.tochka.com/uapi"
SANDBOX_URL = "https://enter.tochka.com/sandbox/v2"
PUBLIC_KEY_URL = "https://enter.tochka.com/doc/openapi/static/keys/public"
SANDBOX_TOKEN = "sandbox.jwt.token"  # noqa: S105 - публичный токен песочницы из документации


def kop_to_rub(kop: int) -> float:
    """Копейки → рубли числом для JSON (точно для двух знаков после запятой)."""
    return float(Decimal(kop) / 100)


def rub_to_kop(value: Any) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal(1)))


class TochkaGateway:
    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        customer_code: str,
        merchant_id: str | None,
        transport: httpx.AsyncBaseTransport | None = None,
        public_jwk: dict[str, Any] | None = None,
        public_key_url: str = PUBLIC_KEY_URL,
        timeout: float = 20.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._customer_code = customer_code
        self._merchant_id = merchant_id
        self._client = httpx.AsyncClient(
            transport=transport,
            timeout=timeout,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        self._public_jwk = public_jwk
        self._public_key_url = public_key_url
        self._key_lock = asyncio.Lock()

    @classmethod
    def from_settings(cls, settings: Settings) -> "TochkaGateway":
        if settings.tochka_mode is IntegrationMode.SANDBOX:
            return cls(
                base_url=SANDBOX_URL,
                token=settings.tochka_jwt.get_secret_value()
                if settings.tochka_jwt
                else SANDBOX_TOKEN,
                customer_code=settings.tochka_customer_code or "1234567ab",
                merchant_id=settings.tochka_merchant_id or "200000000001097",
                public_key_url=settings.tochka_webhook_public_key_url,
            )
        if not (settings.tochka_jwt and settings.tochka_customer_code):
            raise RuntimeError("Для боевого режима Точки нужны TOCHKA_JWT и TOCHKA_CUSTOMER_CODE")
        return cls(
            base_url=PRODUCTION_URL,
            token=settings.tochka_jwt.get_secret_value(),
            customer_code=settings.tochka_customer_code,
            merchant_id=settings.tochka_merchant_id,
            public_key_url=settings.tochka_webhook_public_key_url,
        )

    async def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        try:
            response = await self._client.request(
                method,
                f"{self._base}{path}",
                content=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
                headers={"Content-Type": "application/json"} if body is not None else None,
            )
        except httpx.HTTPError as exc:
            raise PaymentGatewayError(f"Точка недоступна: {exc!r}") from exc
        if response.status_code >= 400:
            raise PaymentGatewayError(self._error_text(response))
        try:
            return response.json()
        except ValueError as exc:
            raise PaymentGatewayError("Точка вернула не JSON") from exc

    @staticmethod
    def _error_text(response: httpx.Response) -> str:
        try:
            data = response.json()
        except ValueError:
            return f"HTTP {response.status_code}: {response.text[:300]}"
        errors = data.get("Errors") or []
        details = "; ".join(str(e.get("message", "")) for e in errors if isinstance(e, dict))
        return f"HTTP {response.status_code}: {data.get('message', '')} {details}".strip()

    async def create_payment(self, request: PaymentRequest) -> PaymentLink:
        data: dict[str, Any] = {
            "customerCode": self._customer_code,
            "amount": kop_to_rub(request.amount_kop),
            "purpose": request.purpose[:140],
            "redirectUrl": request.redirect_url,
            "failRedirectUrl": request.fail_redirect_url,
            "paymentMode": ["card", "sbp"],
            "ttl": request.ttl_minutes,
            "paymentLinkId": request.payment_link_id,
            "taxSystemCode": request.tax_system,
            "Client": {
                "email": request.client_email,
                "name": request.client_name,
                "phone": request.client_phone,
            },
            "Items": [
                {
                    "name": item.name[:256],
                    "amount": kop_to_rub(item.amount_kop // item.quantity),
                    "quantity": item.quantity,
                    "vatType": request.vat_type,
                    "paymentMethod": "full_prepayment",
                    "paymentObject": "service" if item.is_service else "goods",
                    "measure": "шт.",
                }
                for item in request.items
            ],
        }
        if self._merchant_id:
            data["merchantId"] = self._merchant_id
        result = await self._request(
            "POST", "/acquiring/v1.0/payments_with_receipt", {"Data": data}
        )
        try:
            payload = result["Data"]
            return PaymentLink(
                operation_id=str(payload["operationId"]), url=str(payload["paymentLink"])
            )
        except (KeyError, TypeError) as exc:
            raise PaymentGatewayError(f"Неожиданный ответ Точки: {result!r}"[:500]) from exc

    async def get_payment(self, operation_id: str) -> PaymentInfo:
        result = await self._request("GET", f"/acquiring/v1.0/payments/{operation_id}")
        try:
            operation = result["Data"]["Operation"][0]
        except (KeyError, IndexError, TypeError) as exc:
            raise PaymentGatewayError(f"Неожиданный ответ Точки: {result!r}"[:500]) from exc
        paid_at = operation.get("paidAt")
        return PaymentInfo(
            operation_id=str(operation.get("operationId", operation_id)),
            status=PaymentStatus.parse(operation.get("status")),
            amount_kop=rub_to_kop(operation.get("amount", 0)),
            payment_link_id=operation.get("paymentLinkId"),
            paid_at=datetime.fromisoformat(paid_at) if paid_at else None,
            raw=operation,
        )

    async def refund(self, operation_id: str, amount_kop: int) -> RefundResult:
        result = await self._request(
            "POST",
            f"/acquiring/v1.0/payments/{operation_id}/refund",
            {"Data": {"amount": kop_to_rub(amount_kop)}},
        )
        data = result.get("Data") if isinstance(result, dict) else None
        if not isinstance(data, dict) or not data.get("isRefund"):
            raise PaymentGatewayError(f"Точка не подтвердила возврат: {result!r}"[:500])
        refund_id = data.get("orderId")
        return RefundResult(refund_id=str(refund_id) if refund_id else None, raw=data)

    async def _get_public_key(self) -> Any:
        async with self._key_lock:
            if self._public_jwk is None:
                try:
                    response = await self._client.get(self._public_key_url)
                    response.raise_for_status()
                    self._public_jwk = response.json()
                except (httpx.HTTPError, ValueError) as exc:
                    raise WebhookSignatureError("не удалось получить публичный ключ Точки") from exc
            return RSAAlgorithm.from_jwk(json.dumps(self._public_jwk))

    async def parse_webhook(self, body: bytes) -> WebhookNotice:
        key = await self._get_public_key()
        try:
            payload = jwt.decode(
                body.decode().strip(),
                key=key,
                algorithms=["RS256"],
                options={"require": [], "verify_aud": False},
            )
        except (jwt.PyJWTError, UnicodeDecodeError) as exc:
            raise WebhookSignatureError(f"подпись вебхука не прошла проверку: {exc}") from exc
        operation_id = payload.get("operationId")
        if not operation_id:
            raise WebhookSignatureError("во вебхуке нет operationId")
        return WebhookNotice(
            operation_id=str(operation_id),
            payment_link_id=payload.get("paymentLinkId"),
            status=PaymentStatus.parse(payload.get("status")),
            raw=payload,
        )
