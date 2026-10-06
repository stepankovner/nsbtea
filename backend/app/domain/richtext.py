"""Проверка документа визуального редактора (TipTap JSON).

Витрина рисует только разрешённые элементы, поэтому всё остальное отклоняем при сохранении:
так в страницу не попадёт ни скрипт, ни чужая разметка.
"""

from typing import Any

from app.domain.errors import DomainError

ALLOWED_NODES = {
    "doc",
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "image",
    "horizontalRule",
    "hardBreak",
    "text",
    "productCard",
}
ALLOWED_MARKS = {"bold", "italic", "strike", "link", "underline"}
MAX_NODES = 5_000
MAX_DEPTH = 12


def _check_url(value: Any) -> None:
    if not isinstance(value, str):
        raise DomainError("Ссылка в тексте некорректна")
    allowed = ("https://", "http://", "/", "mailto:", "tel:", "#")
    if not value.startswith(allowed):
        raise DomainError(
            "Ссылка в тексте некорректна — используйте адрес, начинающийся с https://"
        )


def validate_document(doc: Any) -> dict[str, Any]:
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise DomainError("Текст страницы повреждён — обновите страницу и попробуйте снова")
    count = 0

    def walk(node: Any, depth: int) -> None:
        nonlocal count
        count += 1
        if count > MAX_NODES:
            raise DomainError("Текст слишком большой — разбейте его на несколько страниц")
        if depth > MAX_DEPTH or not isinstance(node, dict):
            raise DomainError("Текст страницы повреждён")
        kind = node.get("type")
        if kind not in ALLOWED_NODES:
            raise DomainError("В тексте есть неподдерживаемый элемент — удалите его")
        if kind == "text" and not isinstance(node.get("text"), str):
            raise DomainError("Текст страницы повреждён")
        if kind == "heading":
            level = (node.get("attrs") or {}).get("level")
            if level not in (2, 3, 4):
                raise DomainError("Заголовки в тексте — только второго–четвёртого уровня")
        if kind == "image":
            _check_url((node.get("attrs") or {}).get("src"))
        for mark in node.get("marks") or []:
            if not isinstance(mark, dict) or mark.get("type") not in ALLOWED_MARKS:
                raise DomainError("В тексте есть неподдерживаемое оформление")
            if mark.get("type") == "link":
                _check_url((mark.get("attrs") or {}).get("href"))
        for child in node.get("content") or []:
            walk(child, depth + 1)

    walk(doc, 0)
    return doc


def plain_text(doc: dict[str, Any] | None, limit: int = 300) -> str:
    """Текст документа без разметки — для описаний в поисковиках."""
    parts: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text":
                parts.append(str(node.get("text", "")))
            for child in node.get("content") or []:
                walk(child)
            if node.get("type") in ("paragraph", "heading"):
                parts.append(" ")

    walk(doc or {})
    return " ".join("".join(parts).split())[:limit]
