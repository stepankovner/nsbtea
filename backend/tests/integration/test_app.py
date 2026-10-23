"""Каркас приложения: здоровье, единый формат ошибок на русском."""

from httpx import ASGITransport, AsyncClient

from app.config import Environment
from app.container import Container
from app.main import create_app


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


async def test_unknown_route_is_json_404(client: AsyncClient) -> None:
    response = await client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["detail"] == "Страница не найдена"


async def test_validation_errors_are_human_readable(client: AsyncClient) -> None:
    response = await client.post("/api/admin/auth/login", json={"email": "", "password": ""})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["detail"] == "Проверьте заполнение полей"
    fields = {e["field"] for e in body["errors"]}
    assert {"email", "password"} <= fields
    assert all(e["message"] and e["message"].isascii() is False for e in body["errors"])


async def test_malformed_json(client: AsyncClient) -> None:
    response = await client.post(
        "/api/admin/auth/login",
        content=b"{not json",
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_security_headers(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


async def test_api_schema_is_hidden_on_production(container: Container) -> None:
    """Схема API перечисляет все адреса админки — на боевом сайте её не отдаём
    (типы фронтенда собираются из `python -m app.cli export-openapi`, а не с сервера)."""
    container.settings = container.settings.model_copy(
        update={"environment": Environment.PRODUCTION}
    )
    app = create_app(container)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://nsbtea.test") as ac:
        assert (await ac.get("/api/openapi.json")).status_code == 404
        assert (await ac.get("/api/docs")).status_code == 404
        assert (await ac.get("/api/health")).status_code == 200


async def test_api_schema_is_available_off_production(client: AsyncClient) -> None:
    response = await client.get("/api/openapi.json")
    assert response.status_code == 200
    assert "/api/health" in response.json()["paths"]
