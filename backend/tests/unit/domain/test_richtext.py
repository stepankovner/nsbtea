"""Проверка документа редактора: только разрешённые элементы."""

import pytest

from app.domain.errors import DomainError
from app.domain.richtext import plain_text, validate_document


def doc(*content: dict) -> dict:  # type: ignore[type-arg]
    return {"type": "doc", "content": list(content)}


def text(value: str, marks: list[dict] | None = None) -> dict:  # type: ignore[type-arg]
    node: dict = {"type": "text", "text": value}  # type: ignore[type-arg]
    if marks:
        node["marks"] = marks
    return node


def test_valid_document() -> None:
    document = doc(
        {"type": "heading", "attrs": {"level": 2}, "content": [text("Заголовок")]},
        {"type": "paragraph", "content": [text("Жирный", [{"type": "bold"}])]},
        {
            "type": "paragraph",
            "content": [text("ссылка", [{"type": "link", "attrs": {"href": "https://nsbtea.ru"}}])],
        },
        {"type": "image", "attrs": {"src": "/media/images/a/640.webp", "alt": "Чай"}},
        {"type": "productCard", "attrs": {"slug": "da-hun-pao"}},
    )
    assert validate_document(document) is document


@pytest.mark.parametrize(
    "bad",
    [
        {"type": "paragraph"},
        doc({"type": "script", "content": []}),
        doc({"type": "heading", "attrs": {"level": 1}, "content": [text("H1")]}),
        doc(
            {
                "type": "paragraph",
                "content": [
                    text("x", [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}])
                ],
            }
        ),
        doc({"type": "image", "attrs": {"src": "data:image/png;base64,AAA"}}),
        doc({"type": "paragraph", "content": [text("x", [{"type": "textStyle"}])]}),
    ],
)
def test_rejected(bad: dict) -> None:  # type: ignore[type-arg]
    with pytest.raises(DomainError):
        validate_document(bad)


def test_plain_text() -> None:
    document = doc(
        {"type": "heading", "attrs": {"level": 2}, "content": [text("Пуэр")]},
        {"type": "paragraph", "content": [text("Тёмный  и "), text("мягкий")]},
    )
    assert plain_text(document) == "Пуэр Тёмный и мягкий"
