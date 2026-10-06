"""Каркас приложения: здоровье, единый формат ошибок на русском."""

from httpx import AsyncClient


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
