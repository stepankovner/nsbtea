"""Расчёт доставки СДЭК: общий интерфейс и заглушка. Боевая реализация — integrations/cdek.py."""

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class Parcel:
    weight_grams: int
    length_cm: int
    width_cm: int
    height_cm: int


@dataclass(frozen=True, slots=True)
class CdekQuote:
    tariff_code: int
    price_kop: int
    period_min: int | None
    period_max: int | None


@dataclass(frozen=True, slots=True)
class CdekCity:
    code: int
    name: str
    region: str | None


class DeliveryGatewayError(Exception):
    pass


class CdekGateway(Protocol):
    async def calculate(
        self, *, tariff_code: int, from_city_code: int, to: dict[str, Any], parcel: Parcel
    ) -> CdekQuote: ...

    async def suggest_cities(self, query: str) -> list[CdekCity]: ...

    async def proxy_widget(
        self, action: str, params: dict[str, Any]
    ) -> tuple[int, Any, dict[str, str]]:
        """Прокси для виджета ПВЗ (аналог service.php): статус, тело, заголовки x-*."""
        ...


class FakeCdekGateway:
    """Предсказуемые цены для тестов и разработки без ключей СДЭК."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = False

    async def calculate(
        self, *, tariff_code: int, from_city_code: int, to: dict[str, Any], parcel: Parcel
    ) -> CdekQuote:
        self.calls.append({"tariff_code": tariff_code, "to": to, "parcel": parcel})
        if self.fail:
            raise DeliveryGatewayError("СДЭК недоступен (тестовая ошибка)")
        base = 35_000 if tariff_code == 136 else 45_000
        extra = max(0, parcel.weight_grams - 500) // 500 * 5_000
        return CdekQuote(
            tariff_code=tariff_code, price_kop=base + extra, period_min=2, period_max=4
        )

    async def suggest_cities(self, query: str) -> list[CdekCity]:
        if self.fail:
            raise DeliveryGatewayError("СДЭК недоступен (тестовая ошибка)")
        cities = [CdekCity(94, "Владимир", "Владимирская область"), CdekCity(44, "Москва", None)]
        return [c for c in cities if c.name.lower().startswith(query.strip().lower())]

    async def proxy_widget(
        self, action: str, params: dict[str, Any]
    ) -> tuple[int, Any, dict[str, str]]:
        if action in ("offices", "byCoordinate"):
            office = {
                "code": "VLD2",
                "name": "Владимир, Большая Московская",
                "type": "PVZ",
                "location": {
                    "city_code": 94,
                    "city": "Владимир",
                    "address": "ул. Большая Московская, 1",
                    "latitude": 56.128,
                    "longitude": 40.406,
                },
                "work_time": "Пн-Пт 10:00-20:00",
            }
            return 200, [office], {"x-total-elements": "1"}
        if action == "calculate":
            return 200, {"tariff_codes": [{"tariff_code": 136, "delivery_sum": 350.0}]}, {}
        return 400, {"message": "Unknown action"}, {}
