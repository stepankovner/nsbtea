"""Расчёт доставки (SPEC 6) и прокси виджета СДЭК."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.integrations.delivery import FakeCdekGateway
from app.models import Setting
from tests.factories import make_tea, make_unit
from tests.helpers import add_to_cart


def cdek(container: Container) -> FakeCdekGateway:
    assert isinstance(container.cdek, FakeCdekGateway)
    return container.cdek


async def test_cdek_quote_uses_parcel_weight_and_box(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    tea = await make_tea(db, presets=[100], stock=1000)
    cup = await make_unit(db, stock=3, weight_grams=700)
    await add_to_cart(client, tea.id, grams=100, qty=2)
    await add_to_cart(client, cup.id, kind="unit", grams=0)
    response = await client.post(
        "/api/delivery/quote",
        json={"delivery": {"method": "cdek_pvz", "city_code": 44, "pvz_code": "MSK1"}},
    )
    assert response.status_code == 200, response.text
    quote = response.json()
    call = cdek(container).calls[-1]
    # 200 г чая + 700 г чаша + 50 г упаковка
    assert call["parcel"].weight_grams == 950
    assert call["parcel"].length_cm == 20  # маленькая коробка до 1 кг
    assert call["tariff_code"] == 136
    assert call["to"] == {"code": 44}
    # заглушка СДЭК: 350 ₽ за тариф 136 и +50 ₽ за каждые полные 500 г сверх первых 500 г
    assert quote["price_kop"] == 35_000
    assert quote["period"] == "2–4 дн."


async def test_free_cdek_from_threshold(client: AsyncClient, db: AsyncSession) -> None:
    db.add(Setting(key="delivery", value={"cdek_free_from_kop": 100_000}))
    await db.commit()
    tea = await make_tea(db, price_per_gram_kop=2_000, presets=[100], stock=1000)
    await add_to_cart(client, tea.id, grams=100)
    quote = (
        await client.post(
            "/api/delivery/quote",
            json={"delivery": {"method": "cdek_pvz", "city_code": 44, "pvz_code": "MSK1"}},
        )
    ).json()
    assert quote["price_kop"] == 0
    assert quote["free"] is True


async def test_cdek_unavailable(
    client: AsyncClient, db: AsyncSession, container: Container
) -> None:
    tea = await make_tea(db)
    await add_to_cart(client, tea.id)
    cdek(container).fail = True
    response = await client.post(
        "/api/delivery/quote",
        json={"delivery": {"method": "cdek_door", "address": "Москва, Тверская 1"}},
    )
    assert response.status_code == 502
    assert "СДЭК" in response.json()["detail"]


async def test_courier_price_from_settings(client: AsyncClient, db: AsyncSession) -> None:
    db.add(
        Setting(
            key="delivery", value={"courier_price_kop": 30_000, "courier_free_from_kop": 300_000}
        )
    )
    await db.commit()
    tea = await make_tea(db, price_per_gram_kop=1_000, presets=[100], stock=1000)
    await add_to_cart(client, tea.id, grams=100)
    quote = (
        await client.post(
            "/api/delivery/quote",
            json={"delivery": {"method": "courier", "address": "Владимир, Мира 5"}},
        )
    ).json()
    assert quote["price_kop"] == 30_000


async def test_disabled_method(client: AsyncClient, db: AsyncSession) -> None:
    db.add(Setting(key="delivery", value={"pickup_enabled": False}))
    await db.commit()
    tea = await make_tea(db)
    await add_to_cart(client, tea.id)
    response = await client.post("/api/delivery/quote", json={"delivery": {"method": "pickup"}})
    assert response.status_code == 422
    assert response.json()["detail"] == "Этот способ доставки сейчас недоступен"


async def test_widget_proxy(client: AsyncClient) -> None:
    response = await client.get("/api/delivery/cdek/service?action=offices&city_code=94")
    assert response.status_code == 200
    assert response.headers["x-total-elements"] == "1"
    assert response.json()[0]["code"] == "VLD2"
    bad = await client.get("/api/delivery/cdek/service?action=hack")
    assert bad.status_code == 400
    calc = await client.post(
        "/api/delivery/cdek/service",
        json={"action": "calculate", "from_location": {"code": 94}, "to_location": {"code": 44}},
    )
    assert calc.status_code == 200
