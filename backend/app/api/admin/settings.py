"""Настройки магазина — только владелец."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import Db, Owner
from app.services import settings as settings_service
from app.services.settings_schema import (
    ALL_GROUPS,
    TAX_SYSTEMS,
    VAT_TYPES,
    CatalogSettings,
    DeliverySettings,
    LoyaltySettings,
    PaymentSettings,
    SeoSettings,
    SettingsGroup,
    StoreSettings,
    ThursdaySettings,
)

router = APIRouter(prefix="/admin/settings", tags=["admin: настройки"])


class AllSettingsOut(BaseModel):
    store: StoreSettings
    catalog: CatalogSettings
    loyalty: LoyaltySettings
    thursday: ThursdaySettings
    delivery: DeliverySettings
    payment: PaymentSettings
    seo: SeoSettings


class SettingsMetaOut(BaseModel):
    groups: dict[str, dict[str, Any]]
    tax_systems: dict[str, str]
    vat_types: dict[str, str]


@router.get("", response_model=AllSettingsOut, summary="Все настройки")
async def get_settings(_: Owner, db: Db) -> AllSettingsOut:
    groups = await settings_service.get_all(db)
    return AllSettingsOut.model_validate({k: v.model_dump() for k, v in groups.items()})


@router.get("/meta", response_model=SettingsMetaOut, summary="Подписи и подсказки к полям")
async def settings_meta(_: Owner) -> SettingsMetaOut:
    return SettingsMetaOut(
        groups={g.key: {"title": g.title, "schema": g.model_json_schema()} for g in ALL_GROUPS},
        tax_systems=TAX_SYSTEMS,
        vat_types=VAT_TYPES,
    )


def _register(group: type[SettingsGroup]) -> None:
    async def update(payload: SettingsGroup, context: Owner, db: Db) -> SettingsGroup:
        return await settings_service.update_group(
            db, context.user, group, payload.model_dump(mode="json")
        )

    # FastAPI берёт тип тела из аннотации — подставляем конкретную группу настроек
    update.__annotations__["payload"] = group
    update.__annotations__["return"] = group
    update.__name__ = f"update_{group.key}_settings"
    router.add_api_route(
        f"/{group.key}",
        update,
        methods=["PUT"],
        response_model=group,
        summary=f"Сохранить: {group.title}",
    )


for _group in ALL_GROUPS:
    _register(_group)
