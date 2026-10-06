"""Клиент СДЭК API v2 (см. docs/INTEGRATIONS.md)."""

import json
from urllib.parse import parse_qs

import httpx
import pytest

from app.integrations.cdek import CdekClient
from app.integrations.delivery import DeliveryGatewayError, Parcel

BASE = "https://api.edu.cdek.ru/v2"
PARCEL = Parcel(weight_grams=650, length_cm=20, width_cm=15, height_cm=10)


def token_response(token: str = "tok-1", expires_in: int = 3599) -> httpx.Response:
    return httpx.Response(
        200, json={"access_token": token, "token_type": "bearer", "expires_in": expires_in}
    )


class Recorder:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self.requests: list[httpx.Request] = []
        self._responses = responses

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self._responses.pop(0)


def client(recorder: Recorder) -> CdekClient:
    return CdekClient(
        base_url=BASE,
        client_id="id",
        client_secret="secret",
        transport=httpx.MockTransport(recorder),
    )


async def test_calculate_uses_total_sum_and_caches_token() -> None:
    tariff = {
        "delivery_sum": 210.0,
        "total_sum": 252.4,
        "period_min": 2,
        "period_max": 4,
        "currency": "RUB",
    }
    recorder = Recorder(
        [token_response(), httpx.Response(200, json=tariff), httpx.Response(200, json=tariff)]
    )
    cdek = client(recorder)
    quote = await cdek.calculate(tariff_code=136, from_city_code=94, to={"code": 44}, parcel=PARCEL)
    await cdek.calculate(tariff_code=136, from_city_code=94, to={"code": 44}, parcel=PARCEL)

    assert quote.price_kop == 25_240
    assert quote.period_min == 2
    assert quote.period_max == 4

    token_request = recorder.requests[0]
    assert str(token_request.url) == f"{BASE}/oauth/token"
    form = parse_qs(token_request.content.decode())
    assert form["grant_type"] == ["client_credentials"]
    assert form["client_id"] == ["id"]
    assert form["client_secret"] == ["secret"]

    calc = recorder.requests[1]
    assert str(calc.url) == f"{BASE}/calculator/tariff"
    assert calc.headers["authorization"] == "Bearer tok-1"
    body = json.loads(calc.content)
    assert body["tariff_code"] == 136
    assert body["type"] == 1
    assert body["from_location"] == {"code": 94}
    assert body["to_location"] == {"code": 44}
    assert body["packages"] == [{"weight": 650, "length": 20, "width": 15, "height": 10}]
    assert len(recorder.requests) == 3  # токен запрошен один раз


async def test_expired_token_is_refreshed() -> None:
    tariff = {"delivery_sum": 300.0, "total_sum": 300.0, "period_min": 1, "period_max": 2}
    recorder = Recorder(
        [
            token_response("old"),
            httpx.Response(401, json={"errors": [{"code": "v2_token_expired"}]}),
            token_response("new"),
            httpx.Response(200, json=tariff),
        ]
    )
    quote = await client(recorder).calculate(
        tariff_code=137, from_city_code=94, to={"address": "Москва, Тверская 1"}, parcel=PARCEL
    )
    assert quote.price_kop == 30_000
    assert recorder.requests[3].headers["authorization"] == "Bearer new"


async def test_error_message_from_cdek() -> None:
    recorder = Recorder(
        [
            token_response(),
            httpx.Response(
                400,
                json={
                    "errors": [
                        {
                            "code": "v2_recipient_location_not_recognized",
                            "message": "Не удалось определить город получателя",
                        }
                    ]
                },
            ),
        ]
    )
    with pytest.raises(DeliveryGatewayError, match="город получателя"):
        await client(recorder).calculate(
            tariff_code=136, from_city_code=94, to={"code": 0}, parcel=PARCEL
        )


async def test_suggest_cities() -> None:
    recorder = Recorder(
        [
            token_response(),
            httpx.Response(
                200,
                json=[
                    {"code": 94, "full_name": "Владимир, Владимирская обл., Россия"},
                    {"code": 49884, "full_name": "Владимир, Иркутская обл., Россия"},
                ],
            ),
        ]
    )
    cities = await client(recorder).suggest_cities("Влад")
    request = recorder.requests[1]
    assert request.url.path.endswith("/location/suggest/cities")
    assert request.url.params["name"] == "Влад"
    assert request.url.params["country_code"] == "RU"
    assert [c.code for c in cities] == [94, 49884]
    assert cities[0].name == "Владимир, Владимирская обл., Россия"


async def test_widget_offices_proxy_passes_paging_headers() -> None:
    offices = [{"code": "VLD2", "location": {"city_code": 94}}]
    recorder = Recorder(
        [
            token_response(),
            httpx.Response(
                200, json=offices, headers={"x-total-elements": "1", "x-total-pages": "1"}
            ),
        ]
    )
    status, body, headers = await client(recorder).proxy_widget(
        "offices", {"action": "offices", "city_code": "94", "is_handout": "true", "page": "0"}
    )
    request = recorder.requests[1]
    assert request.url.path.endswith("/deliverypoints")
    assert "action" not in request.url.params
    assert request.url.params["city_code"] == "94"
    assert status == 200
    assert body == offices
    assert headers["x-total-elements"] == "1"


async def test_widget_calculate_proxy() -> None:
    recorder = Recorder(
        [token_response(), httpx.Response(200, json={"tariff_codes": [{"tariff_code": 136}]})]
    )
    status, body, _ = await client(recorder).proxy_widget(
        "calculate",
        {"action": "calculate", "from_location": {"code": 94}, "to_location": {"code": 44}},
    )
    request = recorder.requests[1]
    assert request.url.path.endswith("/calculator/tarifflist")
    assert json.loads(request.content) == {
        "from_location": {"code": 94},
        "to_location": {"code": 44},
        "type": 1,
    }
    assert status == 200
    assert body["tariff_codes"][0]["tariff_code"] == 136


async def test_widget_unknown_action() -> None:
    status, body, _ = await client(Recorder([])).proxy_widget("hack", {})
    assert status == 400
    assert body == {"message": "Unknown action"}


async def test_transient_network_error_is_retried() -> None:
    calls = {"n": 0}

    def flaky(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("сбой")
        if request.url.path.endswith("/oauth/token"):
            return token_response()
        return httpx.Response(200, json=[{"code": 94, "full_name": "Владимир"}])

    cdek = CdekClient(
        base_url=BASE, client_id="id", client_secret="s", transport=httpx.MockTransport(flaky)
    )
    cities = await cdek.suggest_cities("Влад")
    assert cities[0].code == 94


async def test_persistent_network_error() -> None:
    def broken(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("нет сети")

    cdek = CdekClient(
        base_url=BASE, client_id="id", client_secret="s", transport=httpx.MockTransport(broken)
    )
    with pytest.raises(DeliveryGatewayError, match="недоступен"):
        await cdek.suggest_cities("Влад")


async def test_widget_offices_by_coordinates_proxy() -> None:
    recorder = Recorder([token_response(), httpx.Response(200, json=[{"code": "VLD2"}])])
    status, body, _ = await client(recorder).proxy_widget(
        "byCoordinate", {"action": "byCoordinate", "latitude": "56.1", "longitude": "40.4"}
    )
    request = recorder.requests[1]
    assert request.method == "GET"
    assert request.url.path.endswith("/deliverypoints/byPolygons")
    assert request.url.params["latitude"] == "56.1"
    assert "action" not in request.url.params
    assert status == 200
    assert body == [{"code": "VLD2"}]
