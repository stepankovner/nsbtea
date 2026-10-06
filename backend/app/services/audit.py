"""Журнал действий сотрудников: кто, когда, что изменил (было → стало)."""

from collections.abc import Mapping
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminUser, AuditLog


def diff_fields(before: Mapping[str, Any], after: Mapping[str, Any]) -> dict[str, list[Any]]:
    """{"поле": [было, стало]} только для изменившихся полей."""
    keys = set(before) | set(after)
    return {
        key: [before.get(key), after.get(key)]
        for key in sorted(keys)
        if before.get(key) != after.get(key)
    }


async def record(
    db: AsyncSession,
    actor: AdminUser | None,
    *,
    action: str,
    entity: str,
    entity_id: object | None = None,
    summary: str,
    diff: Mapping[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_name=actor.name if actor else "Система",
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary,
        diff=_jsonable(dict(diff or {})),
    )
    db.add(entry)
    return entry


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set | frozenset):
        return [_jsonable(v) for v in value]
    if value is None or isinstance(value, bool | int | float | str):
        return value
    return str(value)
