"""Стоимость доставки (SPEC 6). Цена всегда считается на сервере — сумме из браузера не верим."""

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import DomainError, ExternalServiceError
from app.domain.orders import DeliveryMethod
from app.domain.shipping import Box, choose_box, delivery_price
from app.integrations.delivery import DeliveryGatewayError, Parcel
from app.schemas.checkout import DeliveryIn
from app.services.settings import get_group
from app.services.settings_schema import DeliverySettings


@dataclass(frozen=True, slots=True)
class Quote:
    method: DeliveryMethod
    price_kop: int
    free: bool
    period: str | None
    data: dict[str, Any] = field(default_factory=dict)


def _period(period_min: int | None, period_max: int | None) -> str | None:
    if period_min and period_max and period_min != period_max:
        return f"{period_min}–{period_max} дн."
    if period_max or period_min:
        return f"{period_max or period_min} дн."
    return None


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


async def quote(
    db: AsyncSession,
    container: Container,
    delivery: DeliveryIn,
    *,
    items_kop: int,
    weight_grams: int,
) -> Quote:
    settings = await get_group(db, DeliverySettings)
    method = DeliveryMethod(delivery.method)
    if method not in settings.enabled_methods():
        raise DomainError("Этот способ доставки сейчас недоступен", field="delivery.method")

    if method is DeliveryMethod.PICKUP:
        return Quote(method, 0, True, None, {"pickup_address": settings.pickup_address})

    if method is DeliveryMethod.COURIER:
        address = _clean(delivery.address)
        if not address:
            raise DomainError("Укажите адрес доставки", field="delivery.address")
        price = delivery_price(
            base_kop=settings.courier_price_kop,
            items_kop=items_kop,
            free_from_kop=settings.courier_free_from_kop,
        )
        courier_data: dict[str, Any] = {
            "address": address,
            "courier_time": _clean(delivery.courier_time),
        }
        return Quote(method, price, price == 0, None, courier_data)

    box: Box = choose_box([Box(**b.model_dump()) for b in settings.boxes], weight_grams)
    parcel = Parcel(
        weight_grams=weight_grams,
        length_cm=box.length_cm,
        width_cm=box.width_cm,
        height_cm=box.height_cm,
    )
    data: dict[str, Any] = {
        "city_code": delivery.city_code,
        "city_name": _clean(delivery.city_name),
        "box": box.code,
        "weight_grams": weight_grams,
    }
    if method is DeliveryMethod.CDEK_PVZ:
        if not delivery.city_code or not _clean(delivery.pvz_code):
            raise DomainError("Выберите пункт выдачи СДЭК на карте", field="delivery.pvz_code")
        to: dict[str, Any] = {"code": delivery.city_code}
        tariff = settings.cdek_pvz_tariff
        data |= {"pvz_code": _clean(delivery.pvz_code), "pvz_address": _clean(delivery.pvz_address)}
    else:
        address = _clean(delivery.address)
        if not address:
            raise DomainError("Укажите адрес доставки", field="delivery.address")
        to = {"address": address}
        if delivery.postal_code:
            to["postal_code"] = delivery.postal_code
        if delivery.city_code:
            to["code"] = delivery.city_code
        tariff = settings.cdek_door_tariff
        data |= {"address": address, "postal_code": _clean(delivery.postal_code)}
    try:
        result = await container.cdek.calculate(
            tariff_code=tariff,
            from_city_code=settings.origin_city_code,
            to=to,
            parcel=parcel,
        )
    except DeliveryGatewayError as exc:
        raise ExternalServiceError(
            "Не удалось рассчитать доставку СДЭК. Попробуйте ещё раз через минуту "
            "или выберите другой способ."
        ) from exc
    price = delivery_price(
        base_kop=result.price_kop,
        items_kop=items_kop,
        free_from_kop=settings.cdek_free_from_kop,
    )
    data |= {"tariff_code": tariff, "cdek_price_kop": result.price_kop}
    return Quote(method, price, price == 0, _period(result.period_min, result.period_max), data)
