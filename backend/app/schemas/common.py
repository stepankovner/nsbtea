"""Общие типы для схем API: валидаторы с русскими сообщениями."""

from collections.abc import Callable
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.domain.contacts import normalize_email, normalize_phone, normalize_telegram
from app.domain.errors import DomainError
from app.domain.slugs import is_valid_slug


def _wrap(fn: Callable[[str], str]) -> Callable[[str], str]:
    """DomainError → ValueError, чтобы pydantic показал наш текст в списке ошибок поля."""

    def validator(value: str) -> str:
        try:
            return fn(value)
        except DomainError as exc:
            raise ValueError(exc.message) from exc

    return validator


def _slug(value: str) -> str:
    value = value.strip().lower()
    if not is_valid_slug(value):
        raise ValueError("Адрес страницы: только латиница, цифры и дефисы, например shu-puer")
    return value


def _strip(value: str) -> str:
    return value.strip()


Email = Annotated[str, AfterValidator(_wrap(normalize_email))]
Phone = Annotated[str, AfterValidator(_wrap(normalize_phone))]
Telegram = Annotated[str, AfterValidator(_wrap(normalize_telegram))]
Slug = Annotated[str, AfterValidator(_slug)]
Name = Annotated[str, AfterValidator(_strip), Field(min_length=1, max_length=120)]
Text = Annotated[str, AfterValidator(_strip), Field(max_length=5000)]


class ApiModel(BaseModel):
    # в схеме ответа поля со значением по умолчанию — обязательные (сервер их всегда отдаёт),
    # иначе в типах фронтенда они выглядели бы необязательными
    model_config = ConfigDict(
        from_attributes=True, json_schema_serialization_defaults_required=True
    )


class Ok(ApiModel):
    ok: bool = True


class Page[T](ApiModel):
    items: list[T]
    total: int
    page: int = 1
    per_page: int = 50


def none_if_blank(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value
