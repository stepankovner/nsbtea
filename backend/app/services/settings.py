"""Чтение и сохранение настроек магазина (таблица settings, по группе на запись)."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import NotFoundError
from app.models import AdminUser, Setting
from app.services import audit
from app.services.settings_schema import GROUPS_BY_KEY, SettingsGroup


async def get_group[G: SettingsGroup](db: AsyncSession, group: type[G]) -> G:
    row = await db.get(Setting, group.key)
    return group.model_validate(row.value if row else {})


async def get_all(db: AsyncSession) -> dict[str, SettingsGroup]:
    rows = {row.key: row.value for row in (await db.scalars(select(Setting))).all()}
    return {key: group.model_validate(rows.get(key, {})) for key, group in GROUPS_BY_KEY.items()}


def group_class(key: str) -> type[SettingsGroup]:
    try:
        return GROUPS_BY_KEY[key]
    except KeyError as exc:
        raise NotFoundError("Такого раздела настроек нет") from exc


async def update_group(
    db: AsyncSession, actor: AdminUser, group: type[SettingsGroup], data: dict[str, Any]
) -> SettingsGroup:
    value = group.model_validate(data)
    current = await get_group(db, group)
    row = await db.get(Setting, group.key)
    dumped = value.model_dump(mode="json")
    if row is None:
        db.add(Setting(key=group.key, value=dumped))
    else:
        row.value = dumped
    await audit.record(
        db,
        actor,
        action="settings.update",
        entity="settings",
        entity_id=group.key,
        summary=f"Изменены настройки «{group.title}»",
        diff=audit.diff_fields(current.model_dump(mode="json"), dumped),
    )
    return value
