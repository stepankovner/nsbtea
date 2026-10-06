"""Админка: дашборд (SPEC 10.2), глобальный поиск, журнал действий, получатели уведомлений."""

import re
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import Field
from sqlalchemy import ColumnElement, func, or_, select

from app.api.admin.catalog import main_image_url
from app.api.deps import Admin, Db, Deps, Owner
from app.container import Container
from app.core.security import hash_token, new_human_code
from app.domain.errors import NotFoundError
from app.domain.inventory import format_qty
from app.domain.orders import OrderStatus
from app.domain.texts import day_month, normalize_search
from app.domain.thursday import MSK, msk_today, upcoming_thursdays
from app.models import (
    AdminChallenge,
    AdminUser,
    Application,
    AuditLog,
    Customer,
    NotificationRecipient,
    Order,
    Page,
    Product,
    ThursdayPlan,
)
from app.models.admin import AdminPermission, ChallengePurpose
from app.models.content import APPLICATION_TYPE_LABELS, ApplicationType
from app.models.system import NOTIFICATION_EVENT_LABELS
from app.schemas.common import ApiModel, Ok
from app.services import inventory
from app.services import orders as order_service
from app.services.admin_orders import OrderFilters, list_orders
from app.services.inventory import product_type
from app.services.seed import LEGAL_SLUGS
from app.services.settings import get_group
from app.services.settings_schema import StoreSettings

router = APIRouter(prefix="/admin", tags=["admin: обзор"])


# ------------------------------------------------------------------ dashboard


class Attention(ApiModel):
    new_orders: int
    assembling: int
    needs_attention: int
    awaiting_payment: int


class DashOrder(ApiModel):
    id: uuid.UUID
    number: str
    status: str
    status_label: str
    name: str
    total_kop: int
    created_at: datetime


class Revenue(ApiModel):
    today_kop: int
    today_orders: int
    week_kop: int
    week_orders: int
    month_kop: int
    month_orders: int


class LowStockRow(ApiModel):
    product_id: uuid.UUID
    name: str
    stock_label: str
    level: str
    image_url: str | None


class ThursdayRow(ApiModel):
    date: str
    label: str
    planned: bool
    products_count: int


class ApplicationRow(ApiModel):
    id: uuid.UUID
    name: str
    type_label: str
    created_at: datetime


class ChecklistItem(ApiModel):
    key: str
    title: str
    hint: str
    done: bool
    href: str


class DashboardOut(ApiModel):
    attention: Attention
    new_orders: list[DashOrder]
    revenue: Revenue | None
    low_stock: list[LowStockRow]
    thursdays: list[ThursdayRow]
    new_applications: list[ApplicationRow]
    new_applications_count: int
    launch_checklist: list[ChecklistItem]


def _msk_start(day: Any) -> datetime:
    return datetime.combine(day, time.min, tzinfo=MSK).astimezone(UTC)


async def _revenue(db: Db, container: Container) -> Revenue:
    today = msk_today(container.clock.now())
    periods = {
        "today": _msk_start(today),
        "week": _msk_start(today - timedelta(days=today.weekday())),
        "month": _msk_start(today.replace(day=1)),
    }
    values: dict[str, tuple[int, int]] = {}
    for key, start in periods.items():
        row = (
            await db.execute(
                select(
                    func.count(), func.coalesce(func.sum(Order.total_kop - Order.refunded_kop), 0)
                ).where(
                    Order.paid_at >= start,
                    Order.status != OrderStatus.CANCELLED.value,
                )
            )
        ).one()
        values[key] = (int(row[0]), int(row[1]))
    return Revenue(
        today_kop=values["today"][1],
        today_orders=values["today"][0],
        week_kop=values["week"][1],
        week_orders=values["week"][0],
        month_kop=values["month"][1],
        month_orders=values["month"][0],
    )


async def _checklist(db: Db, user: AdminUser) -> list[ChecklistItem]:
    store = await get_group(db, StoreSettings)
    legal = (
        await db.scalars(
            select(Page.slug).where(
                Page.slug.in_(LEGAL_SLUGS), Page.is_published.is_(True), Page.archived_at.is_(None)
            )
        )
    ).all()
    products = await db.scalar(
        select(func.count()).select_from(Product).where(Product.status == "published")
    )
    return [
        ChecklistItem(
            key="telegram",
            title="Подключите Telegram",
            hint="Сюда будут приходить заказы и коды входа.",
            done=user.telegram_chat_id is not None,
            href="/admin/settings/telegram",
        ),
        ChecklistItem(
            key="requisites",
            title="Заполните реквизиты ИП",
            hint="Они показываются в подвале сайта и нужны для оферты.",
            done=bool(store.legal_name and store.inn),
            href="/admin/settings/store",
        ),
        ChecklistItem(
            key="legal_pages",
            title="Опубликуйте оферту, политику и согласие",
            hint="Без них покупатель не сможет подтвердить согласие при оформлении.",
            done=len(legal) == len(LEGAL_SLUGS),
            href="/admin/pages",
        ),
        ChecklistItem(
            key="products",
            title="Добавьте товары на сайт",
            hint="Хотя бы один товар должен быть опубликован.",
            done=bool(products),
            href="/admin/products/new",
        ),
        ChecklistItem(
            key="contacts",
            title="Укажите телефон и ссылку на Telegram",
            hint="Покупатели увидят их в подвале сайта.",
            done=bool(store.phone and store.telegram_url),
            href="/admin/settings/store",
        ),
    ]


@router.get("/dashboard", response_model=DashboardOut, summary="Главный экран админки")
async def dashboard(context: Admin, db: Db, container: Deps) -> DashboardOut:
    user = context.user
    counts = dict(
        (await db.execute(select(Order.status, func.count()).group_by(Order.status))).all()
    )
    attention = Attention(
        new_orders=int(counts.get("paid", 0)) + int(counts.get("accepted", 0)),
        assembling=int(counts.get("assembling", 0)),
        needs_attention=int(counts.get("needs_attention", 0)),
        awaiting_payment=int(counts.get("awaiting_payment", 0)),
    )
    new_orders: list[DashOrder] = []
    if user.has_permission(AdminPermission.ORDERS):
        rows = (
            await db.scalars(
                select(Order)
                .where(Order.status.in_(["paid", "accepted", "needs_attention", "assembling"]))
                .order_by(Order.created_at.desc())
                .limit(10)
            )
        ).all()
        new_orders = [
            DashOrder(
                id=o.id,
                number=o.display_number,
                status=o.status,
                status_label=order_service.public_status_label(o),
                name=o.name,
                total_kop=o.total_kop,
                created_at=o.created_at,
            )
            for o in rows
        ]
    low: list[LowStockRow] = []
    if user.has_permission(AdminPermission.INVENTORY) or user.has_permission(
        AdminPermission.PRODUCTS
    ):
        stock_rows = await inventory.stock_rows(db, only_attention=True)
        low = [
            LowStockRow(
                product_id=r.product.id,
                name=r.product.name,
                stock_label=format_qty(product_type(r.product), r.product.stock),
                level=r.level.value,
                image_url=main_image_url(container, r.product),
            )
            for r in stock_rows[:10]
        ]
    today = msk_today(container.clock.now())
    days = upcoming_thursdays(today, 4)
    plans = {
        p.date: p
        for p in (
            await db.scalars(
                select(ThursdayPlan).where(
                    ThursdayPlan.date >= days[0], ThursdayPlan.date <= days[-1]
                )
            )
        ).all()
    }
    applications: list[ApplicationRow] = []
    applications_count = 0
    if user.has_permission(AdminPermission.APPLICATIONS):
        applications_count = int(
            await db.scalar(
                select(func.count()).select_from(Application).where(Application.status == "new")
            )
            or 0
        )
        applications = [
            ApplicationRow(
                id=a.id,
                name=a.name,
                type_label=APPLICATION_TYPE_LABELS.get(ApplicationType(a.type), a.type),
                created_at=a.created_at,
            )
            for a in (
                await db.scalars(
                    select(Application)
                    .where(Application.status == "new")
                    .order_by(Application.created_at.desc())
                    .limit(5)
                )
            ).all()
        ]
    return DashboardOut(
        attention=attention,
        new_orders=new_orders,
        revenue=await _revenue(db, container) if user.is_owner else None,
        low_stock=low,
        thursdays=[
            ThursdayRow(
                date=d.isoformat(),
                label=day_month(d),
                planned=d in plans and bool(plans[d].products),
                products_count=len(plans[d].products) if d in plans else 0,
            )
            for d in days
        ],
        new_applications=applications,
        new_applications_count=applications_count,
        launch_checklist=await _checklist(db, user) if user.is_owner else [],
    )


# ------------------------------------------------------------------ search


class SearchProduct(ApiModel):
    id: uuid.UUID
    name: str
    status: str
    image_url: str | None


class SearchOrder(ApiModel):
    id: uuid.UUID
    number: str
    name: str
    status_label: str
    total_kop: int


class SearchCustomer(ApiModel):
    id: uuid.UUID
    name: str | None
    email: str | None
    phone: str | None


class SearchOut(ApiModel):
    products: list[SearchProduct]
    orders: list[SearchOrder]
    customers: list[SearchCustomer]


@router.get("/search", response_model=SearchOut, summary="Поиск по админке")
async def search(
    context: Admin, db: Db, container: Deps, q: Annotated[str, Query(min_length=1, max_length=100)]
) -> SearchOut:
    user = context.user
    term = q.strip()
    digits = re.sub(r"\D", "", term)
    products: list[SearchProduct] = []
    if user.has_permission(AdminPermission.PRODUCTS) or user.has_permission(
        AdminPermission.INVENTORY
    ):
        rows = (
            await db.scalars(
                select(Product)
                .where(
                    Product.archived_at.is_(None),
                    Product.search_text.ilike(f"%{normalize_search(term)}%"),
                )
                .order_by(Product.name)
                .limit(5)
            )
        ).all()
        products = [
            SearchProduct(
                id=p.id, name=p.name, status=p.status, image_url=main_image_url(container, p)
            )
            for p in rows
        ]
    orders: list[SearchOrder] = []
    if user.has_permission(AdminPermission.ORDERS):
        found, _, _ = await list_orders(db, OrderFilters(q=term), page=1, per_page=5)
        orders = [
            SearchOrder(
                id=o.id,
                number=o.display_number,
                name=o.name,
                status_label=order_service.public_status_label(o),
                total_kop=o.total_kop,
            )
            for o in found
        ]
    customers: list[SearchCustomer] = []
    if user.has_permission(AdminPermission.CUSTOMERS):
        conditions: list[ColumnElement[bool]] = [
            Customer.email.ilike(f"%{term}%"),
            Customer.name.ilike(f"%{term}%"),
        ]
        if len(digits) >= 4:
            conditions.append(Customer.phone.contains(digits[-10:]))
        rows_c = (
            await db.scalars(
                select(Customer).where(Customer.anonymized_at.is_(None), or_(*conditions)).limit(5)
            )
        ).all()
        customers = [
            SearchCustomer(id=c.id, name=c.name, email=c.email, phone=c.phone) for c in rows_c
        ]
    return SearchOut(products=products, orders=orders, customers=customers)


# ------------------------------------------------------------------ audit


class AuditEntry(ApiModel):
    id: uuid.UUID
    at: datetime
    actor_name: str
    action: str
    entity: str
    entity_id: str | None
    summary: str
    diff: dict[str, Any]


class AuditOut(ApiModel):
    items: list[AuditEntry]
    total: int


@router.get("/audit", response_model=AuditOut, summary="Журнал действий")
async def audit_log(
    _: Owner,
    db: Db,
    entity: str | None = None,
    actor_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditOut:
    query = select(AuditLog)
    if entity:
        query = query.where(AuditLog.entity == entity)
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    total = int(await db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = (
        await db.scalars(
            query.order_by(AuditLog.at.desc(), AuditLog.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()
    return AuditOut(
        items=[
            AuditEntry(
                id=e.id,
                at=e.at,
                actor_name=e.actor_name,
                action=e.action,
                entity=e.entity,
                entity_id=e.entity_id,
                summary=e.summary,
                diff=e.diff,
            )
            for e in rows
        ],
        total=total,
    )


# ------------------------------------------------------------------ notifications


class RecipientOut(ApiModel):
    id: uuid.UUID
    chat_id: int
    name: str
    events: list[str]
    is_active: bool


class EventOption(ApiModel):
    value: str
    label: str


class NotificationsOut(ApiModel):
    recipients: list[RecipientOut]
    events: list[EventOption]
    bot_username: str | None


class RecipientPatch(ApiModel):
    events: list[str] | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)


class LinkOut(ApiModel):
    code: str
    deep_link: str
    expires_at: datetime


@router.get("/notifications", response_model=NotificationsOut, summary="Получатели уведомлений")
async def notifications(_: Owner, db: Db, container: Deps) -> NotificationsOut:
    rows = (
        await db.scalars(select(NotificationRecipient).order_by(NotificationRecipient.created_at))
    ).all()
    return NotificationsOut(
        recipients=[RecipientOut.model_validate(r) for r in rows],
        events=[
            EventOption(value=e.value, label=label)
            for e, label in NOTIFICATION_EVENT_LABELS.items()
        ],
        bot_username=container.settings.telegram_bot_username,
    )


@router.patch("/notifications/{recipient_id}", response_model=RecipientOut, summary="Изменить")
async def update_recipient(
    recipient_id: uuid.UUID, payload: RecipientPatch, _: Owner, db: Db
) -> RecipientOut:
    recipient = await db.get(NotificationRecipient, recipient_id)
    if recipient is None:
        raise NotFoundError("Получатель не найден")
    if payload.events is not None:
        valid = {e.value for e in NOTIFICATION_EVENT_LABELS}
        recipient.events = [e for e in payload.events if e in valid]
    if payload.is_active is not None:
        recipient.is_active = payload.is_active
    if payload.name is not None:
        recipient.name = payload.name
    return RecipientOut.model_validate(recipient)


@router.delete("/notifications/{recipient_id}", response_model=Ok, summary="Удалить получателя")
async def delete_recipient(recipient_id: uuid.UUID, _: Owner, db: Db) -> Ok:
    recipient = await db.get(NotificationRecipient, recipient_id)
    if recipient is not None:
        await db.delete(recipient)
    return Ok()


@router.post("/notifications/link", response_model=LinkOut, summary="Добавить чат-получатель")
async def recipient_link(context: Owner, db: Db, container: Deps) -> LinkOut:
    code = new_human_code()
    expires = container.clock.now() + timedelta(minutes=30)
    db.add(
        AdminChallenge(
            admin_user_id=context.user.id,
            purpose=ChallengePurpose.RECIPIENT_LINK.value,
            code_hash=hash_token(code, container.secret),
            expires_at=expires,
        )
    )
    username = container.settings.telegram_bot_username or "nsbtea_bot"
    return LinkOut(code=code, deep_link=f"https://t.me/{username}?start={code}", expires_at=expires)
