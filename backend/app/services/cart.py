"""Корзина: серверная, по cookie для гостя и по аккаунту для покупателя (SPEC 4.1).

`compute()` — единственное место, где считаются суммы: корзина на сайте и оформление
заказа используют один и тот же расчёт.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.security import hash_token, new_token
from app.domain.errors import DomainError, InsufficientStockError, NotFoundError
from app.domain.inventory import CartQuantity, check_cart_against_stock
from app.domain.loyalty import (
    LoyaltyRules,
    max_points_to_spend,
    points_to_earn,
    resolve_points_to_spend,
)
from app.domain.pricing import (
    ProductType,
    VariantKind,
    pack_price_kop,
    validate_tea_variant,
    variant_label,
)
from app.domain.promotions import (
    DiscountResult,
    OrderDiscountSource,
    PromotionKind,
    WelcomeRule,
    calculate_discounts,
)
from app.domain.receipt import allocate
from app.domain.shipping import parcel_weight
from app.models import Cart, CartItem, Customer, Order, Product
from app.services import promo_codes
from app.services.catalog_admin import tea_pricing
from app.services.pricing import PromoContext, discount_line, load_context
from app.services.settings import get_group
from app.services.settings_schema import DeliverySettings, LoyaltySettings
from app.services.storefront import visible_condition

MAX_QTY = 99
POINTS_MAX = -1  # «списать максимум»
ACTIVE_ORDER_STATUSES = (
    "awaiting_payment",
    "accepted",
    "paid",
    "assembling",
    "shipped",
    "completed",
)


# ------------------------------------------------------------------ cart lookup


async def find_cart(
    db: AsyncSession, container: Container, *, customer: Customer | None, token: str | None
) -> Cart | None:
    if customer is not None:
        return await db.scalar(select(Cart).where(Cart.customer_id == customer.id))
    if token:
        return await db.scalar(
            select(Cart).where(
                Cart.token_hash == hash_token(token, container.secret), Cart.customer_id.is_(None)
            )
        )
    return None


async def get_or_create(
    db: AsyncSession, container: Container, *, customer: Customer | None, token: str | None
) -> tuple[Cart, str | None]:
    """Корзина и новый токен для cookie (если корзина гостевая и создана сейчас)."""
    cart = await find_cart(db, container, customer=customer, token=token)
    if cart is not None:
        return cart, None
    if customer is not None:
        cart = Cart(customer_id=customer.id, items=[])
        db.add(cart)
        await db.flush()
        return cart, None
    new = new_token()
    cart = Cart(token_hash=hash_token(new, container.secret), items=[])
    db.add(cart)
    await db.flush()
    return cart, new


async def merge_guest_cart(
    db: AsyncSession, container: Container, customer: Customer, token: str | None
) -> None:
    guest = await find_cart(db, container, customer=None, token=token)
    if guest is None:
        return
    target, _ = await get_or_create(db, container, customer=customer, token=None)
    if guest.id == target.id:
        return
    existing = {(i.product_id, i.variant_kind, i.grams): i for i in target.items}
    for item in guest.items:
        key = (item.product_id, item.variant_kind, item.grams)
        if key in existing:
            existing[key].qty = min(MAX_QTY, existing[key].qty + item.qty)
        else:
            target.items.append(
                CartItem(
                    product_id=item.product_id,
                    variant_kind=item.variant_kind,
                    grams=item.grams,
                    qty=item.qty,
                )
            )
    if guest.promo_code and not target.promo_code:
        target.promo_code = guest.promo_code
    await db.delete(guest)
    await db.flush()


# ------------------------------------------------------------------ editing


async def _visible_product(db: AsyncSession, product_id: uuid.UUID, now: datetime) -> Product:
    product = await db.scalar(
        select(Product).where(Product.id == product_id, *visible_condition(now))
    )
    if product is None:
        raise NotFoundError("Товар не найден или снят с продажи")
    return product


def _validate_variant(product: Product, kind: str, grams: int) -> tuple[str, int]:
    if product.type == ProductType.UNIT.value:
        return "unit", 0
    try:
        variant = VariantKind(kind)
    except ValueError as exc:
        raise DomainError("Выберите вес") from exc
    pricing = tea_pricing(product)
    if pricing is None:
        raise DomainError("У этого чая пока нет цены")
    validate_tea_variant(pricing, variant, grams)
    return variant.value, grams


def _amount(product: Product, item_grams: int, qty: int) -> int:
    return item_grams * qty if product.type == ProductType.TEA.value else qty


async def _ensure_stock(cart: Cart, product: Product, extra: list[tuple[int, int]]) -> None:
    """Суммарное количество товара по всем строкам корзины не больше остатка."""
    lines = [
        CartQuantity(
            product_id=product.id,
            product_name=product.name,
            type=ProductType(product.type),
            amount=_amount(product, grams, qty),
        )
        for grams, qty in extra
    ]
    problems = check_cart_against_stock(lines, {product.id: product.stock})
    if problems:
        raise InsufficientStockError(problems[0].message)


def _other_lines(
    cart: Cart, product_id: uuid.UUID, skip: uuid.UUID | None
) -> list[tuple[int, int]]:
    return [(i.grams, i.qty) for i in cart.items if i.product_id == product_id and i.id != skip]


async def add_item(
    db: AsyncSession,
    container: Container,
    cart: Cart,
    *,
    product_id: uuid.UUID,
    kind: str,
    grams: int,
    qty: int,
) -> None:
    if not 1 <= qty <= MAX_QTY:
        raise DomainError(f"Количество — от 1 до {MAX_QTY}", field="qty")
    product = await _visible_product(db, product_id, container.clock.now())
    kind, grams = _validate_variant(product, kind, grams)
    existing = next(
        (
            i
            for i in cart.items
            if i.product_id == product.id and i.variant_kind == kind and i.grams == grams
        ),
        None,
    )
    new_qty = min(MAX_QTY, (existing.qty if existing else 0) + qty)
    await _ensure_stock(
        cart,
        product,
        [*_other_lines(cart, product.id, existing.id if existing else None), (grams, new_qty)],
    )
    if existing:
        existing.qty = new_qty
    else:
        cart.items.append(CartItem(product_id=product.id, variant_kind=kind, grams=grams, qty=qty))
    await db.flush()


async def update_item(
    db: AsyncSession,
    container: Container,
    cart: Cart,
    item_id: uuid.UUID,
    *,
    qty: int | None,
    kind: str | None,
    grams: int | None,
) -> None:
    item = next((i for i in cart.items if i.id == item_id), None)
    if item is None:
        raise NotFoundError("Этой позиции уже нет в корзине")
    product = await _visible_product(db, item.product_id, container.clock.now())
    new_kind, new_grams = item.variant_kind, item.grams
    if kind is not None or grams is not None:
        new_kind, new_grams = _validate_variant(
            product, kind or item.variant_kind, grams if grams is not None else item.grams
        )
    new_qty = qty if qty is not None else item.qty
    if not 1 <= new_qty <= MAX_QTY:
        raise DomainError(f"Количество — от 1 до {MAX_QTY}", field="qty")
    twin = next(
        (
            i
            for i in cart.items
            if i.id != item.id
            and i.product_id == item.product_id
            and i.variant_kind == new_kind
            and i.grams == new_grams
        ),
        None,
    )
    others = [
        (i.grams, i.qty)
        for i in cart.items
        if i.product_id == item.product_id and i.id not in (item.id, twin.id if twin else None)
    ]
    merged_qty = min(MAX_QTY, new_qty + (twin.qty if twin else 0))
    await _ensure_stock(cart, product, [*others, (new_grams, merged_qty)])
    if twin is not None:
        twin.qty = merged_qty
        cart.items.remove(item)
    else:
        item.variant_kind, item.grams, item.qty = new_kind, new_grams, new_qty
    await db.flush()


async def remove_item(db: AsyncSession, cart: Cart, item_id: uuid.UUID) -> None:
    item = next((i for i in cart.items if i.id == item_id), None)
    if item is not None:
        cart.items.remove(item)
        await db.flush()


async def clear(db: AsyncSession, cart: Cart) -> None:
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    cart.promo_code = None
    cart.points_to_spend = 0
    await db.flush()
    await db.refresh(cart, ["items"])


async def set_promo_code(
    db: AsyncSession, container: Container, cart: Cart, code: str, customer: Customer | None
) -> None:
    result = await promo_codes.check(
        db,
        code,
        container.clock.now(),
        customer_id=customer.id if customer else None,
        email=customer.email if customer else None,
    )
    if result.promo is None or result.rule is None:
        raise DomainError(result.message or "Промокод не подошёл", field="code")
    cart.promo_code = result.code


# ------------------------------------------------------------------ calculation


@dataclass(slots=True)
class LineCalc:
    item: CartItem
    product: Product
    kind: str
    grams: int
    qty: int
    label: str
    pack_price_kop: int
    line_total_kop: int
    product_discount_kop: int = 0
    order_discount_kop: int = 0
    points_kop: int = 0
    promotion_title: str | None = None
    problem: str | None = None
    unavailable: bool = False  # товар снят или вариант больше не продаётся — не считаем в сумме

    @property
    def total_kop(self) -> int:
        return self.line_total_kop - self.product_discount_kop - self.order_discount_kop

    @property
    def stock_amount(self) -> int:
        return self.grams * self.qty if self.product.type == ProductType.TEA.value else self.qty

    @property
    def receipt_amount_kop(self) -> int:
        return self.total_kop - self.points_kop


@dataclass(slots=True)
class PromoState:
    code: str
    applied: bool
    message: str | None


@dataclass(slots=True)
class WelcomeState:
    percent: int
    applied: bool
    tentative: bool


@dataclass(slots=True)
class PointsState:
    enabled: bool
    balance: int
    max_spend: int
    requested: int
    applied: int


@dataclass(slots=True)
class CartCalc:
    lines: list[LineCalc]
    discounts: DiscountResult | None
    promo: PromoState | None
    promo_code_id: uuid.UUID | None
    welcome: WelcomeState | None
    points: PointsState
    points_to_earn: int
    problems: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    parcel_weight_grams: int = 0
    is_first_order: bool | None = None

    @property
    def items_total_kop(self) -> int:
        return self.discounts.items_total_kop if self.discounts else 0

    @property
    def product_discount_kop(self) -> int:
        return self.discounts.product_discount_kop if self.discounts else 0

    @property
    def order_discount_kop(self) -> int:
        return self.discounts.order_discount_kop if self.discounts else 0

    @property
    def order_discount_source(self) -> OrderDiscountSource | None:
        return self.discounts.order_discount_source if self.discounts else None

    @property
    def items_after_discounts_kop(self) -> int:
        return self.discounts.items_after_discounts_kop if self.discounts else 0

    @property
    def total_without_delivery_kop(self) -> int:
        return self.items_after_discounts_kop - self.points.applied * 100

    @property
    def count(self) -> int:
        return sum(line.qty for line in self.lines)


async def is_first_order(
    db: AsyncSession, *, customer: Customer | None, email: str | None
) -> bool | None:
    if customer is None and email:
        customer = await db.scalar(select(Customer).where(Customer.email == email))
        if customer is None:
            return True
    if customer is None:
        return None
    if customer.first_paid_order_at is not None:
        return False
    active = await db.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.customer_id == customer.id, Order.status.in_(ACTIVE_ORDER_STATUSES))
    )
    return not active


async def compute(
    db: AsyncSession,
    container: Container,
    cart: Cart | None,
    *,
    customer: Customer | None,
    email: str | None = None,
    promo_ctx: PromoContext | None = None,
) -> CartCalc:
    now = container.clock.now()
    ctx = promo_ctx or await load_context(db, now)
    loyalty = await get_group(db, LoyaltySettings)
    delivery = await get_group(db, DeliverySettings)
    items = list(cart.items) if cart else []

    lines: list[LineCalc] = []
    visible_ids = (
        set(
            (
                await db.scalars(
                    select(Product.id).where(
                        Product.id.in_([i.product_id for i in items]), *visible_condition(now)
                    )
                )
            ).all()
        )
        if items
        else set()
    )
    for item in items:
        product = item.product
        await db.refresh(product, ["stock"])
        problem: str | None = None
        unavailable = False
        price = 0
        label = (
            variant_label(VariantKind(item.variant_kind), item.grams)
            if item.variant_kind != "unit"
            else "1 шт."
        )
        if product.id not in visible_ids:
            unavailable = True
            problem = f"«{product.name}» больше не продаётся — удалите из корзины"
        elif product.type == ProductType.TEA.value:
            pricing = tea_pricing(product)
            try:
                if pricing is None:
                    raise DomainError("нет цены")
                validate_tea_variant(pricing, VariantKind(item.variant_kind), item.grams)
                price = pack_price_kop(pricing, VariantKind(item.variant_kind), item.grams)
            except (DomainError, ValueError):
                unavailable = True
                problem = f"«{product.name}»: вариант {label} больше недоступен — выберите другой"
        else:
            price = product.unit_price_kop or 0
            if not price:
                unavailable = True
                problem = f"«{product.name}» больше не продаётся — удалите из корзины"
        lines.append(
            LineCalc(
                item=item,
                product=product,
                kind=item.variant_kind,
                grams=item.grams,
                qty=item.qty,
                label=label,
                pack_price_kop=price,
                line_total_kop=price * item.qty,
                problem=problem,
                unavailable=unavailable,
            )
        )

    # остатки — по сумме строк одного товара
    stock_problems = check_cart_against_stock(
        [
            CartQuantity(
                product_id=line.product.id,
                product_name=line.product.name,
                type=ProductType(line.product.type),
                amount=line.stock_amount,
            )
            for line in lines
            if not line.unavailable
        ],
        {line.product.id: line.product.stock for line in lines},
    )
    problems = [line.problem for line in lines if line.problem]
    for sp in stock_problems:
        problems.append(sp.message)
        for line in lines:
            if line.product.id == sp.product_id and line.problem is None:
                line.problem = sp.message

    priced = [line for line in lines if not line.unavailable]
    first_order = await is_first_order(db, customer=customer, email=email)

    promo_state: PromoState | None = None
    promo_rule = None
    promo_code_id: uuid.UUID | None = None
    if cart and cart.promo_code:
        check = await promo_codes.check(
            db,
            cart.promo_code,
            now,
            customer_id=customer.id if customer else None,
            email=email or (customer.email if customer else None),
        )
        promo_rule = check.rule
        promo_state = PromoState(code=check.code, applied=False, message=check.message)
        if check.rule is not None:
            promo_code_id = check.rule.id

    welcome_rule = WelcomeRule(percent=loyalty.welcome_percent) if loyalty.welcome_enabled else None
    discounts = calculate_discounts(
        [
            discount_line(
                line.product,
                amount_kop=line.line_total_kop,
                grams_total=line.grams * line.qty,
                units=line.qty if line.product.type == ProductType.UNIT.value else 0,
            )
            for line in priced
        ],
        ctx.promotions,
        promo_code=promo_rule,
        welcome=welcome_rule,
        is_first_order=first_order,
    )
    for line, result in zip(priced, discounts.lines, strict=True):
        line.product_discount_kop = result.product_discount_kop
        line.order_discount_kop = result.order_discount_kop
        if result.promotion is not None:
            title = result.promotion.title
            line.promotion_title = (
                f"{title} −{result.promotion.percent}%"
                if result.promotion.percent is not None
                else f"{title} {result.promotion.badge}"
            )
            if result.promotion.kind is PromotionKind.THURSDAY and ctx.thursday is not None:
                line.promotion_title = f"{title} −{ctx.thursday.percent}%"

    if promo_state is not None and promo_rule is not None:
        promo_state.applied = discounts.promo_code_applied
        promo_state.message = discounts.promo_code_message
    welcome_state: WelcomeState | None = None
    if welcome_rule is not None and first_order is not False:
        welcome_state = WelcomeState(
            percent=welcome_rule.percent,
            applied=discounts.order_discount_source is OrderDiscountSource.WELCOME,
            tentative=first_order is None,
        )

    rules = LoyaltyRules(
        earn_percent=loyalty.earn_percent, max_spend_percent=loyalty.max_spend_percent
    )
    balance = customer.points_balance if customer else 0
    max_spend = max_points_to_spend(
        items_after_discounts_kop=discounts.items_after_discounts_kop, balance=balance, rules=rules
    )
    requested = cart.points_to_spend if (cart and customer) else 0
    applied = 0
    if customer is not None and requested:
        applied = (
            max_spend
            if requested == POINTS_MAX
            else resolve_points_to_spend(
                requested,
                items_after_discounts_kop=discounts.items_after_discounts_kop,
                balance=balance,
                rules=rules,
            )
        )
    if applied:
        shares = allocate(applied * 100, [line.total_kop for line in priced])
        for line, share in zip(priced, shares, strict=True):
            line.points_kop = share

    weight = parcel_weight(
        tea_grams=sum(
            line.stock_amount for line in lines if line.product.type == ProductType.TEA.value
        ),
        unit_weights_grams=[
            (line.product.weight_grams or 0) * line.qty
            for line in lines
            if line.product.type == ProductType.UNIT.value
        ],
        packaging_grams=delivery.packaging_grams,
    )
    return CartCalc(
        lines=lines,
        discounts=discounts,
        promo=promo_state,
        promo_code_id=promo_code_id if (promo_state and promo_state.applied) else None,
        welcome=welcome_state,
        points=PointsState(
            enabled=customer is not None,
            balance=balance,
            max_spend=max_spend,
            requested=requested,
            applied=applied,
        ),
        points_to_earn=points_to_earn(
            items_after_discounts_kop=discounts.items_after_discounts_kop,
            points_spent=applied,
            rules=rules,
        ),
        problems=problems,
        notes=list(discounts.notes),
        parcel_weight_grams=weight,
        is_first_order=first_order,
    )
