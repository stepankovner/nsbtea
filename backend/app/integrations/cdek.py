"""СДЭК API v2: расчёт тарифа, поиск городов, прокси для виджета ПВЗ.

Справка — docs/INTEGRATIONS.md.
"""

import asyncio
import functools
import time
from collections.abc import Awaitable, Callable
from decimal import ROUND_CEILING, Decimal
from typing import Any

import httpx

from app.config import IntegrationMode, Settings
from app.integrations.delivery import CdekCity, CdekQuote, DeliveryGatewayError, Parcel

PRODUCTION_URL = "https://api.cdek.ru/v2"
TEST_URL = "https://api.edu.cdek.ru/v2"
# Публичный тестовый аккаунт СДЭК из официальной документации
TEST_CLIENT_ID = "wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP"
TEST_CLIENT_SECRET = "RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5"  # noqa: S105

ONLINE_SHOP_TYPE = 1


def rub_to_kop_ceil(value: Any) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal(1), rounding=ROUND_CEILING))


class CdekClient:
    def __init__(
        self,
        *,
        base_url: str,
        client_id: str,
        client_secret: str,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 15.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._client_id = client_id
        self._client_secret = client_secret
        self._http = httpx.AsyncClient(transport=transport, timeout=timeout)
        self._token: str | None = None
        self._token_expires = 0.0
        self._lock = asyncio.Lock()

    @classmethod
    def from_settings(cls, settings: Settings) -> "CdekClient":
        if settings.cdek_mode is IntegrationMode.SANDBOX:
            return cls(
                base_url=TEST_URL,
                client_id=settings.cdek_client_id or TEST_CLIENT_ID,
                client_secret=(
                    settings.cdek_client_secret.get_secret_value()
                    if settings.cdek_client_secret
                    else TEST_CLIENT_SECRET
                ),
            )
        if not (settings.cdek_client_id and settings.cdek_client_secret):
            raise RuntimeError("Для боевого режима СДЭК нужны CDEK_CLIENT_ID и CDEK_CLIENT_SECRET")
        return cls(
            base_url=PRODUCTION_URL,
            client_id=settings.cdek_client_id,
            client_secret=settings.cdek_client_secret.get_secret_value(),
        )

    @staticmethod
    async def _with_retry(
        call: Callable[[], Awaitable[httpx.Response]], attempts: int = 2
    ) -> httpx.Response:
        """Один повтор при сетевом сбое: запросы СДЭК идемпотентны (расчёт, справочники)."""
        for attempt in range(attempts):
            try:
                return await call()
            except httpx.TransportError as exc:
                if attempt == attempts - 1:
                    raise DeliveryGatewayError(f"СДЭК недоступен: {exc!r}") from exc
                await asyncio.sleep(0.5)
        raise AssertionError("unreachable")

    async def _get_token(self, *, force: bool = False) -> str:
        async with self._lock:
            if not force and self._token and time.monotonic() < self._token_expires - 60:
                return self._token
            response = await self._with_retry(
                lambda: self._http.post(
                    f"{self._base}/oauth/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                    },
                )
            )
            if response.status_code != 200:
                raise DeliveryGatewayError(f"СДЭК не выдал токен: HTTP {response.status_code}")
            data = response.json()
            self._token = str(data["access_token"])
            self._token_expires = time.monotonic() + float(data.get("expires_in", 3600))
            return self._token

    async def _send(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any = None,
    ) -> httpx.Response:
        for attempt in range(2):
            token = await self._get_token(force=attempt > 0)
            response = await self._with_retry(
                functools.partial(
                    self._http.request,
                    method,
                    f"{self._base}{path}",
                    params=params,
                    json=json_body,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                )
            )
            if response.status_code == 401 and attempt == 0:
                continue
            return response
        return response

    @staticmethod
    def _error_text(response: httpx.Response) -> str:
        try:
            data = response.json()
        except ValueError:
            return f"СДЭК: HTTP {response.status_code}"
        errors = data.get("errors") if isinstance(data, dict) else None
        if errors:
            return "; ".join(str(e.get("message") or e.get("code")) for e in errors)
        return f"СДЭК: HTTP {response.status_code}"

    async def calculate(
        self, *, tariff_code: int, from_city_code: int, to: dict[str, Any], parcel: Parcel
    ) -> CdekQuote:
        body = {
            "type": ONLINE_SHOP_TYPE,
            "tariff_code": tariff_code,
            "from_location": {"code": from_city_code},
            "to_location": to,
            "packages": [
                {
                    "weight": parcel.weight_grams,
                    "length": parcel.length_cm,
                    "width": parcel.width_cm,
                    "height": parcel.height_cm,
                }
            ],
        }
        response = await self._send("POST", "/calculator/tariff", json_body=body)
        if response.status_code != 200:
            raise DeliveryGatewayError(self._error_text(response))
        data = response.json()
        if data.get("errors"):
            raise DeliveryGatewayError(self._error_text(response))
        price = data.get("total_sum", data.get("delivery_sum"))
        if price is None:
            raise DeliveryGatewayError("СДЭК не вернул стоимость")
        return CdekQuote(
            tariff_code=tariff_code,
            price_kop=rub_to_kop_ceil(price),
            period_min=data.get("period_min"),
            period_max=data.get("period_max"),
        )

    async def suggest_cities(self, query: str) -> list[CdekCity]:
        response = await self._send(
            "GET", "/location/suggest/cities", params={"name": query, "country_code": "RU"}
        )
        if response.status_code != 200:
            raise DeliveryGatewayError(self._error_text(response))
        return [
            CdekCity(code=int(item["code"]), name=str(item.get("full_name", "")), region=None)
            for item in response.json()
            if "code" in item
        ]

    async def proxy_widget(
        self, action: str, params: dict[str, Any]
    ) -> tuple[int, Any, dict[str, str]]:
        payload = {k: v for k, v in params.items() if k != "action"}
        if action == "offices":
            response = await self._send("GET", "/deliverypoints", params=payload)
        elif action == "calculate":
            payload.setdefault("type", ONLINE_SHOP_TYPE)
            response = await self._send("POST", "/calculator/tarifflist", json_body=payload)
        else:
            return 400, {"message": "Unknown action"}, {}
        headers = {k.lower(): v for k, v in response.headers.items() if k.lower().startswith("x-")}
        try:
            body = response.json()
        except ValueError:
            body = {"message": "Некорректный ответ СДЭК"}
        return response.status_code, body, headers
