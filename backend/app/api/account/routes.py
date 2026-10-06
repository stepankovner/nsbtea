"""Личный кабинет покупателя."""

import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import CUSTOMER_COOKIE, CurrentCustomer, Db, Deps
from app.api.public.shop import TelegramIn
from app.domain.contacts import normalize_phone
from app.domain.errors import DomainError, NotFoundError
from app.domain.loyalty import POINTS_KIND_LABELS, PointsKind
from app.domain.orders import DELIVERY_LABELS, DeliveryMethod, OrderStatus
from app.models import CustomerAddress, Favorite, Order, PointsTransaction, Product
from app.schemas.account import (
    AccountOrder,
    AccountOrderItem,
    AddressIn,
    AddressOut,
    CustomerMeOut,
    DeleteAccountIn,
    PointsHistoryItem,
    ProfileIn,
    RepeatOut,
    WalletOut,
)
from app.schemas.common import Ok
from app.schemas.storefront import ProductCard
from app.services import account as account_service
from app.services import customer_auth
from app.services import orders as order_service
from app.services.emails import tracking_url
from app.services.points import pending_points
from app.services.storefront import card_context, make_card, visible_condition

router = APIRouter(prefix="/account", tags=["личный кабинет"])


async def _me(db: Db, customer: CurrentCustomer) -> CustomerMeOut:
    return CustomerMeOut(
        id=customer.id,
        email=customer.email,
        name=customer.name,
        phone=customer.phone,
        telegram_username=customer.telegram_username,
        telegram_linked=customer.telegram_id is not None,
        marketing_consent=customer.marketing_consent,
        points_balance=customer.points_balance,
        points_pending=await pending_points(db, customer.id),
    )


@router.get("/me", response_model=CustomerMeOut, summary="Профиль")
async def me(customer: CurrentCustomer, db: Db) -> CustomerMeOut:
    return await _me(db, customer)


@router.patch("/profile", response_model=CustomerMeOut, summary="Изменить профиль")
async def update_profile(payload: ProfileIn, customer: CurrentCustomer, db: Db) -> CustomerMeOut:
    if payload.name is not None:
        customer.name = " ".join(payload.name.split()) or None
    if payload.phone is not None:
        customer.phone = normalize_phone(payload.phone) if payload.phone.strip() else None
    if payload.marketing_consent is not None:
        customer.marketing_consent = payload.marketing_consent
    return await _me(db, customer)


@router.post("/telegram", response_model=CustomerMeOut, summary="Привязать Telegram")
async def link_telegram(
    payload: TelegramIn, customer: CurrentCustomer, db: Db, container: Deps
) -> CustomerMeOut:
    await customer_auth.link_telegram(
        db, container, customer, payload.model_dump(exclude_none=True)
    )
    return await _me(db, customer)


def _account_order(order: Order, now: object) -> AccountOrder:
    try:
        delivery_label = DELIVERY_LABELS[DeliveryMethod(order.delivery_method)]
    except ValueError:
        delivery_label = order.delivery_method
    return AccountOrder(
        id=order.id,
        number=order.display_number,
        status=order.status,
        status_label=order_service.public_status_label(order),
        created_at=order.created_at,
        total_kop=order.total_kop,
        delivery_label=delivery_label,
        tracking_number=order.tracking_number,
        tracking_url=tracking_url(order),
        points_spent=order.points_spent,
        points_to_earn=order.points_to_earn,
        points_earned=order.points_earned,
        can_pay=order.status == OrderStatus.AWAITING_PAYMENT.value,
        items=[
            AccountOrderItem(
                product_id=i.product_id,
                slug=None,
                name=i.product_name,
                variant_label=i.variant_label,
                qty=i.qty,
                total_kop=i.line_total_kop - i.product_discount_kop - i.order_discount_kop,
            )
            for i in order.items
        ],
    )


@router.get("/orders", response_model=list[AccountOrder], summary="Мои заказы")
async def orders(customer: CurrentCustomer, db: Db, container: Deps) -> list[AccountOrder]:
    rows = (
        await db.scalars(
            select(Order)
            .where(Order.customer_id == customer.id)
            .order_by(Order.created_at.desc())
            .limit(100)
        )
    ).all()
    now = container.clock.now()
    return [_account_order(o, now) for o in rows]


@router.get("/orders/{order_id}", response_model=AccountOrder, summary="Заказ")
async def order(
    order_id: uuid.UUID, customer: CurrentCustomer, db: Db, container: Deps
) -> AccountOrder:
    found = await account_service.customer_order(db, customer, order_id)
    result = _account_order(found, container.clock.now())
    slugs = dict(
        (
            await db.execute(
                select(Product.id, Product.slug).where(
                    Product.id.in_([i.product_id for i in found.items if i.product_id])
                )
            )
        ).all()
    )
    for item in result.items:
        item.slug = slugs.get(item.product_id) if item.product_id else None
    return result


@router.post("/orders/{order_id}/repeat", response_model=RepeatOut, summary="Повторить заказ")
async def repeat(
    order_id: uuid.UUID, customer: CurrentCustomer, db: Db, container: Deps
) -> RepeatOut:
    added, unavailable = await account_service.repeat_order(db, container, customer, order_id)
    return RepeatOut(added=added, unavailable=unavailable)


@router.get("/points", response_model=WalletOut, summary="Баллы")
async def points(customer: CurrentCustomer, db: Db) -> WalletOut:
    rows = (
        await db.execute(
            select(PointsTransaction, Order.number)
            .outerjoin(Order, Order.id == PointsTransaction.order_id)
            .where(PointsTransaction.customer_id == customer.id)
            .order_by(PointsTransaction.created_at.desc(), PointsTransaction.id.desc())
            .limit(200)
        )
    ).all()
    history = []
    for entry, number in rows:
        try:
            label = POINTS_KIND_LABELS[PointsKind(entry.kind)]
        except ValueError:
            label = entry.kind
        history.append(
            PointsHistoryItem(
                id=entry.id,
                delta=entry.delta,
                kind=entry.kind,
                kind_label=label,
                comment=entry.comment,
                order_number=f"NSB-{number}" if number else None,
                created_at=entry.created_at,
                balance_after=entry.balance_after,
            )
        )
    return WalletOut(
        balance=customer.points_balance,
        pending=await pending_points(db, customer.id),
        history=history,
    )


@router.get("/favorites", response_model=list[ProductCard], summary="Избранное")
async def favorites(customer: CurrentCustomer, db: Db, container: Deps) -> list[ProductCard]:
    now = container.clock.now()
    products = (
        await db.scalars(
            select(Product)
            .join(Favorite, Favorite.product_id == Product.id)
            .where(Favorite.customer_id == customer.id, *visible_condition(now))
            .order_by(Favorite.created_at.desc())
        )
    ).all()
    ctx = await card_context(db, container)
    return [make_card(ctx, p) for p in products]


@router.put("/favorites/{product_id}", response_model=Ok, summary="Добавить в избранное")
async def add_favorite(product_id: uuid.UUID, customer: CurrentCustomer, db: Db) -> Ok:
    if await db.get(Product, product_id) is None:
        raise NotFoundError("Товар не найден")
    if await db.get(Favorite, (customer.id, product_id)) is None:
        db.add(Favorite(customer_id=customer.id, product_id=product_id))
    return Ok()


@router.delete("/favorites/{product_id}", response_model=Ok, summary="Убрать из избранного")
async def remove_favorite(product_id: uuid.UUID, customer: CurrentCustomer, db: Db) -> Ok:
    favorite = await db.get(Favorite, (customer.id, product_id))
    if favorite is not None:
        await db.delete(favorite)
    return Ok()


@router.get("/addresses", response_model=list[AddressOut], summary="Адреса")
async def addresses(customer: CurrentCustomer, db: Db) -> list[AddressOut]:
    rows = (
        await db.scalars(
            select(CustomerAddress)
            .where(CustomerAddress.customer_id == customer.id)
            .order_by(CustomerAddress.is_default.desc(), CustomerAddress.created_at)
        )
    ).all()
    return [AddressOut.model_validate(a) for a in rows]


@router.post(
    "/addresses",
    response_model=AddressOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить адрес",
)
async def add_address(payload: AddressIn, customer: CurrentCustomer, db: Db) -> AddressOut:
    count = len(await addresses(customer, db))
    if count >= 20:
        raise DomainError("Можно сохранить не больше 20 адресов")
    address = CustomerAddress(customer_id=customer.id, **payload.model_dump())
    db.add(address)
    await db.flush()
    if address.is_default or count == 0:
        address.is_default = True
        await account_service.set_default_address(db, customer, address.id)
    return AddressOut.model_validate(address)


@router.patch("/addresses/{address_id}", response_model=AddressOut, summary="Изменить адрес")
async def update_address(
    address_id: uuid.UUID, payload: AddressIn, customer: CurrentCustomer, db: Db
) -> AddressOut:
    address = await db.get(CustomerAddress, address_id)
    if address is None or address.customer_id != customer.id:
        raise NotFoundError("Адрес не найден")
    for key, value in payload.model_dump().items():
        setattr(address, key, value)
    if address.is_default:
        await account_service.set_default_address(db, customer, address.id)
    return AddressOut.model_validate(address)


@router.delete("/addresses/{address_id}", response_model=Ok, summary="Удалить адрес")
async def delete_address(address_id: uuid.UUID, customer: CurrentCustomer, db: Db) -> Ok:
    address = await db.get(CustomerAddress, address_id)
    if address is None or address.customer_id != customer.id:
        raise NotFoundError("Адрес не найден")
    await db.delete(address)
    return Ok()


@router.delete("", response_model=Ok, summary="Удалить аккаунт")
async def delete_account(
    payload: DeleteAccountIn, response: Response, customer: CurrentCustomer, db: Db, container: Deps
) -> Ok:
    if not payload.confirm:
        raise DomainError("Подтвердите удаление аккаунта")
    await account_service.anonymize(db, container, customer)
    response.delete_cookie(CUSTOMER_COOKIE, path="/")
    return Ok()
