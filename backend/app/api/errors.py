"""Единый формат ошибок API: {"detail": "...", "code": "...", "field"?, "errors"?}.

Тексты — на русском и понятны человеку: админка показывает их как есть.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.errors import DomainError

logger = logging.getLogger(__name__)

_HTTP_MESSAGES = {
    400: "Некорректный запрос",
    401: "Войдите, чтобы продолжить",
    403: "Нет доступа",
    404: "Страница не найдена",
    405: "Метод не поддерживается",
    413: "Файл слишком большой",
    429: "Слишком много запросов. Попробуйте чуть позже.",
}


def _validation_message(error: dict[str, Any]) -> str:
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    if kind == "missing":
        return "Обязательное поле"
    if kind == "string_too_short":
        return (
            "Заполните поле"
            if ctx.get("min_length") == 1
            else f"Слишком коротко: нужно не меньше {ctx.get('min_length')} символов"
        )
    if kind == "string_too_long":
        return f"Слишком длинно: не больше {ctx.get('max_length')} символов"
    if kind in ("int_parsing", "int_type", "int_from_float"):
        return "Введите целое число"
    if kind in ("float_parsing", "float_type", "decimal_parsing"):
        return "Введите число"
    if kind == "greater_than":
        return f"Должно быть больше {ctx.get('gt')}"
    if kind == "greater_than_equal":
        return f"Должно быть не меньше {ctx.get('ge')}"
    if kind == "less_than":
        return f"Должно быть меньше {ctx.get('lt')}"
    if kind == "less_than_equal":
        return f"Должно быть не больше {ctx.get('le')}"
    if kind in ("bool_parsing", "bool_type"):
        return "Выберите «да» или «нет»"
    if kind in ("enum", "literal_error"):
        return "Выберите один из предложенных вариантов"
    if kind in ("uuid_parsing", "uuid_type"):
        return "Неверный идентификатор"
    if kind.startswith(("datetime", "date", "time")):
        return "Проверьте дату и время"
    if kind == "too_short":
        return "Добавьте хотя бы один элемент"
    if kind == "too_long":
        return f"Слишком много элементов: не больше {ctx.get('max_length')}"
    if kind == "json_invalid":
        return "Некорректные данные запроса"
    if kind in ("value_error", "assertion_error"):
        message = str(error.get("msg", ""))
        for prefix in ("Value error, ", "Assertion failed, "):
            message = message.removeprefix(prefix)
        return message
    return "Проверьте значение"


def _field_name(loc: tuple[Any, ...]) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header", "cookie")]
    return ".".join(parts) or "body"


def error_body(detail: str, code: str, *, field: str | None = None, **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"detail": detail, "code": code}
    if field:
        body["field"] = field
    body.update(extra)
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.message, exc.code, field=exc.field, **exc.extra),
            status_code=exc.http_status,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": _field_name(tuple(e.get("loc", ()))), "message": _validation_message(e)}
            for e in exc.errors()
        ]
        return JSONResponse(
            error_body("Проверьте заполнение полей", "validation_error", errors=errors),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) and exc.detail else None
        if detail is None or detail in ("Not Found", "Method Not Allowed"):
            detail = _HTTP_MESSAGES.get(exc.status_code, "Ошибка запроса")
        return JSONResponse(
            error_body(detail, f"http_{exc.status_code}"),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Необработанная ошибка", exc_info=exc)
        return JSONResponse(
            error_body(
                "Что-то пошло не так. Мы уже знаем об ошибке и разбираемся.", "server_error"
            ),
            status_code=500,
        )
