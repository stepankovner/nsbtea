"""Вход покупателя, корзина, доставка, оформление, статус заказа, вебхук Точки."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Body, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import (
    CART_COOKIE,
    CUSTOMER_COOKIE,
    CurrentCustomer,
    Db,
    Deps,
    OptionalCustomer,
    client_ip,
)
from app.container import Container
from app.domain.errors import DomainError, ExternalServiceError
from app.domain.orders import DELIVERY_LABELS, DeliveryMethod, OrderStatus
from app.domain.promotions import OrderDiscountSource
from app.integrations.delivery import DeliveryGatewayError
from app.models import Cart, Customer, Order
from app.schemas.checkout import (
    CartItemIn,
    CartItemPatch,
    CartLineOut,
    CartOut,
    CheckoutIn,
    CheckoutOut,
    CityOut,
    OrderItemPublic,
    OrderStatusOut,
    PointsIn,
    PointsStateOut,
    PromoCodeIn,
    PromoStateOut,
    QuoteIn,
    QuoteOut,
    RetryOut,
    WelcomeStateOut,
)
from app.schemas.common import ApiModel, Email, Ok
from app.services import cart as cart_service
from app.services import checkout as checkout_service
from app.services import customer_auth, payments
from app.services import delivery as delivery_service
from app.services import orders as order_service
from app.services.media import media_urls

router = APIRouter(tags=["покупка"])
COOKIE_DAYS = 180


# ------------------------------------------------------------------ cookies


def set_cookie(response: Response, container: Container, name: str, value: str, days: int) -> None:
    response.set_cookie(
        name,
        value,
        max_age=days * 86400,
        httponly=True,
        secure=container.settings.secure_cookies,
        samesite="lax",
        path="/",
    )


# ------------------------------------------------------------------ auth


class CodeIn(ApiModel):
    email: Email


class VerifyIn(ApiModel):
    email: Email
    code: str


class MessageOut(ApiModel):
    ok: bool = True
    message: str


class TelegramIn(ApiModel):
    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


@router.post("/auth/code", response_model=MessageOut, summary="Отправить код на почту")
async def request_code(payload: CodeIn, request: Request, db: Db, container: Deps) -> MessageOut:
    email = await customer_auth.request_code(
        db, container, email=payload.email, ip=client_ip(request)
    )
    return MessageOut(message=f"Отправили код на {email}. Он действует 10 минут.")


async def _after_login(
    request: Request,
    response: Response,
    db: Db,
    container: Container,
    tokens: customer_auth.CustomerTokens,
) -> None:
    await cart_service.merge_guest_cart(
        db, container, tokens.customer, request.cookies.get(CART_COOKIE)
    )
    set_cookie(
        response, container, CUSTOMER_COOKIE, tokens.token, container.settings.customer_session_days
    )
    response.delete_cookie(CART_COOKIE, path="/")


@router.post("/auth/verify", response_model=Ok, summary="Войти по коду")
async def verify_code(
    payload: VerifyIn, request: Request, response: Response, db: Db, container: Deps
) -> Ok:
    tokens = await customer_auth.verify_code(db, container, email=payload.email, code=payload.code)
    await _after_login(request, response, db, container, tokens)
    return Ok()


@router.post("/auth/telegram", response_model=Ok, summary="Войти через Telegram")
async def telegram_login(
    payload: TelegramIn, request: Request, response: Response, db: Db, container: Deps
) -> Ok:
    tokens = await customer_auth.login_telegram(
        db, container, payload.model_dump(exclude_none=True)
    )
    await _after_login(request, response, db, container, tokens)
    return Ok()


@router.post("/auth/logout", response_model=Ok, summary="Выйти")
async def logout(request: Request, response: Response, db: Db, container: Deps) -> Ok:
    token = request.cookies.get(CUSTOMER_COOKIE)
    if token:
        await customer_auth.logout(db, container, token)
    response.delete_cookie(CUSTOMER_COOKIE, path="/")
    return Ok()


# ------------------------------------------------------------------ cart


def _discount_label(calc: cart_service.CartCalc) -> str | None:
    source = calc.order_discount_source
    if source is OrderDiscountSource.PROMO_CODE and calc.promo:
        return f"Промокод {calc.promo.code}"
    if source is OrderDiscountSource.WELCOME and calc.welcome:
        return f"Скидка на первый заказ −{calc.welcome.percent}%"
    return None


def cart_out(container: Container, calc: cart_service.CartCalc) -> CartOut:
    lines: list[CartLineOut] = []
    for line in calc.lines:
        product = line.product
        image = None
        if product.images:
            urls = media_urls(container, product.images[0].media)
            image = urls.get("320") or urls["original"]
        if product.type == "tea":
            others = sum(
                x.grams * x.qty for x in calc.lines if x.product.id == product.id and x is not line
            )
            max_qty = max(0, (product.stock - others) // line.grams) if line.grams else 0
        else:
            others = sum(x.qty for x in calc.lines if x.product.id == product.id and x is not line)
            max_qty = max(0, product.stock - others)
        lines.append(
            CartLineOut(
                id=line.item.id,
                product_id=product.id,
                slug=product.slug,
                name=product.name,
                type=product.type,
                image_url=image,
                hanzi=product.hanzi,
                tile_color=product.category.tile_color if product.category else "neutral",
                variant_kind=line.kind,
                grams=line.grams,
                qty=line.qty,
                variant_label=line.label,
                unit_price_kop=line.pack_price_kop,
                line_total_kop=line.line_total_kop,
                product_discount_kop=line.product_discount_kop,
                order_discount_kop=line.order_discount_kop,
                total_kop=line.line_total_kop - line.product_discount_kop,
                promotion_label=line.promotion_title,
                problem=line.problem,
                max_qty=min(99, max_qty),
            )
        )
    return CartOut(
        lines=lines,
        count=calc.count,
        items_total_kop=calc.items_total_kop,
        product_discount_kop=calc.product_discount_kop,
        order_discount_kop=calc.order_discount_kop,
        order_discount_label=_discount_label(calc),
        items_after_discounts_kop=calc.items_after_discounts_kop,
        promo_code=PromoStateOut(
            code=calc.promo.code, applied=calc.promo.applied, message=calc.promo.message
        )
        if calc.promo
        else None,
        welcome=WelcomeStateOut(
            percent=calc.welcome.percent,
            applied=calc.welcome.applied,
            tentative=calc.welcome.tentative,
        )
        if calc.welcome
        else None,
        points=PointsStateOut(
            enabled=calc.points.enabled,
            balance=calc.points.balance,
            max_spend=calc.points.max_spend,
            requested=calc.points.requested,
            applied=calc.points.applied,
        ),
        points_to_earn=calc.points_to_earn,
        total_without_delivery_kop=calc.total_without_delivery_kop,
        notes=calc.notes,
        problems=calc.problems,
        weight_grams=calc.parcel_weight_grams,
    )


async def _cart(
    request: Request,
    response: Response,
    db: Db,
    container: Container,
    customer: Customer | None,
    *,
    create: bool,
) -> Cart | None:
    token = request.cookies.get(CART_COOKIE)
    if not create:
        return await cart_service.find_cart(db, container, customer=customer, token=token)
    cart, new_token = await cart_service.get_or_create(
        db, container, customer=customer, token=token
    )
    if new_token:
        set_cookie(response, container, CART_COOKIE, new_token, COOKIE_DAYS)
    return cart


async def _out(
    db: Db, container: Container, cart: Cart | None, customer: Customer | None
) -> CartOut:
    if cart is not None:
        await db.refresh(cart, ["items"])
    calc = await cart_service.compute(db, container, cart, customer=customer)
    return cart_out(container, calc)


@router.get("/cart", response_model=CartOut, summary="Корзина")
async def get_cart(
    request: Request, response: Response, db: Db, container: Deps, customer: OptionalCustomer
) -> CartOut:
    cart = await _cart(request, response, db, container, customer, create=False)
    return await _out(db, container, cart, customer)


@router.post("/cart/items", response_model=CartOut, summary="Добавить в корзину")
async def add_item(
    payload: CartItemIn,
    request: Request,
    response: Response,
    db: Db,
    container: Deps,
    customer: OptionalCustomer,
) -> CartOut:
    cart = await _cart(request, response, db, container, customer, create=True)
    assert cart is not None
    await cart_service.add_item(
        db,
        container,
        cart,
        product_id=payload.product_id,
        kind=payload.kind,
        grams=payload.grams,
        qty=payload.qty,
    )
    return await _out(db, container, cart, customer)


async def _existing_cart(
    request: Request, response: Response, db: Db, container: Container, customer: Customer | None
) -> Cart:
    cart = await _cart(request, response, db, container, customer, create=False)
    if cart is None:
        raise DomainError("Корзина пуста")
    return cart


@router.patch("/cart/items/{item_id}", response_model=CartOut, summary="Изменить позицию")
async def update_item(
    item_id: uuid.UUID,
    payload: CartItemPatch,
    request: Request,
    response: Response,
    db: Db,
    container: Deps,
    customer: OptionalCustomer,
) -> CartOut:
    cart = await _existing_cart(request, response, db, container, customer)
    await cart_service.update_item(
        db, container, cart, item_id, qty=payload.qty, kind=payload.kind, grams=payload.grams
    )
    return await _out(db, container, cart, customer)


@router.delete("/cart/items/{item_id}", response_model=CartOut, summary="Убрать из корзины")
async def remove_item(
    item_id: uuid.UUID,
    request: Request,
    response: Response,
    db: Db,
    container: Deps,
    customer: OptionalCustomer,
) -> CartOut:
    cart = await _existing_cart(request, response, db, container, customer)
    await cart_service.remove_item(db, cart, item_id)
    return await _out(db, container, cart, customer)


@router.put("/cart/promo-code", response_model=CartOut, summary="Применить промокод")
async def set_promo(
    payload: PromoCodeIn,
    request: Request,
    response: Response,
    db: Db,
    container: Deps,
    customer: OptionalCustomer,
) -> CartOut:
    cart = await _cart(request, response, db, container, customer, create=True)
    assert cart is not None
    await cart_service.set_promo_code(db, container, cart, payload.code, customer)
    return await _out(db, container, cart, customer)


@router.delete("/cart/promo-code", response_model=CartOut, summary="Убрать промокод")
async def remove_promo(
    request: Request, response: Response, db: Db, container: Deps, customer: OptionalCustomer
) -> CartOut:
    cart = await _cart(request, response, db, container, customer, create=False)
    if cart is not None:
        cart.promo_code = None
    return await _out(db, container, cart, customer)


@router.put("/cart/points", response_model=CartOut, summary="Списать баллы")
async def set_points(
    payload: PointsIn,
    request: Request,
    response: Response,
    db: Db,
    container: Deps,
    customer: CurrentCustomer,
) -> CartOut:
    cart = await _cart(request, response, db, container, customer, create=True)
    assert cart is not None
    cart.points_to_spend = cart_service.POINTS_MAX if payload.max else (payload.points or 0)
    return await _out(db, container, cart, customer)


# ------------------------------------------------------------------ delivery


@router.post("/delivery/quote", response_model=QuoteOut, summary="Стоимость доставки")
async def delivery_quote(
    payload: QuoteIn,
    request: Request,
    response: Response,
    db: Db,
    container: Deps,
    customer: OptionalCustomer,
) -> QuoteOut:
    cart = await _cart(request, response, db, container, customer, create=False)
    calc = await cart_service.compute(db, container, cart, customer=customer)
    quote = await delivery_service.quote(
        db,
        container,
        payload.delivery,
        items_kop=calc.items_after_discounts_kop,
        weight_grams=calc.parcel_weight_grams,
    )
    return QuoteOut(
        method=quote.method.value, price_kop=quote.price_kop, free=quote.free, period=quote.period
    )


@router.get("/delivery/cities", response_model=list[CityOut], summary="Поиск города (СДЭК)")
async def delivery_cities(q: str, request: Request, container: Deps) -> list[CityOut]:
    query = q.strip()
    if len(query) < 2:
        return []
    await container.rate_limiter.hit(
        f"cdek-cities:{client_ip(request)}", limit=120, window_seconds=60
    )
    try:
        cities = await container.cdek.suggest_cities(query[:100])
    except DeliveryGatewayError as exc:
        raise ExternalServiceError(
            "СДЭК сейчас не отвечает. Попробуйте через минуту или выберите другой способ доставки."
        ) from exc
    return [CityOut(code=c.code, name=c.name, region=c.region) for c in cities[:20]]


@router.api_route(
    "/delivery/cdek/service",
    methods=["GET", "POST"],
    summary="Прокси для виджета ПВЗ СДЭК",
    response_model=None,
)
async def cdek_widget_service(
    request: Request, container: Deps, body: Annotated[dict[str, Any] | None, Body()] = None
) -> JSONResponse:
    params: dict[str, Any] = dict(request.query_params)
    if body:
        params.update(body)
    action = str(params.get("action") or "")
    if not action:
        return JSONResponse({"message": "Action is required"}, status_code=400)
    await container.rate_limiter.hit(
        f"cdek-widget:{client_ip(request)}", limit=300, window_seconds=60
    )
    code, payload, headers = await container.cdek.proxy_widget(action, params)
    return JSONResponse(payload, status_code=code, headers=headers)


# ------------------------------------------------------------------ checkout


@router.post(
    "/checkout",
    response_model=CheckoutOut,
    status_code=status.HTTP_201_CREATED,
    summary="Оформить заказ",
)
async def checkout(
    payload: CheckoutIn,
    request: Request,
    db: Db,
    container: Deps,
    customer: OptionalCustomer,
) -> CheckoutOut:
    result = await checkout_service.place_order(
        db,
        container,
        payload,
        customer=customer,
        cart_token=request.cookies.get(CART_COOKIE),
        ip=client_ip(request),
    )
    return CheckoutOut(
        order_id=result.order.id,
        number=result.order.display_number,
        status=result.order.status,
        payment_url=result.payment_url,
        total_kop=result.order.total_kop,
    )


def order_status_out(order: Order, now: Any) -> OrderStatusOut:
    awaiting = order.status == OrderStatus.AWAITING_PAYMENT.value
    try:
        delivery_label = DELIVERY_LABELS[DeliveryMethod(order.delivery_method)]
    except ValueError:
        delivery_label = order.delivery_method
    return OrderStatusOut(
        order_id=order.id,
        number=order.display_number,
        status=order.status,
        status_label=order_service.public_status_label(order),
        paid=order.paid_at is not None,
        can_retry=awaiting and order.reserved_until is not None and order.reserved_until > now,
        reserved_until=order.reserved_until,
        total_kop=order.total_kop,
        delivery_kop=order.delivery_kop,
        delivery_label=delivery_label,
        points_to_earn=order.points_to_earn,
        items=[
            OrderItemPublic(
                name=i.product_name,
                variant_label=i.variant_label,
                qty=i.qty,
                total_kop=i.line_total_kop - i.product_discount_kop - i.order_discount_kop,
            )
            for i in order.items
        ],
    )


@router.get("/orders/{order_id}/status", response_model=OrderStatusOut, summary="Статус оплаты")
async def order_status(
    order_id: uuid.UUID, request: Request, db: Db, container: Deps
) -> OrderStatusOut:
    order = await checkout_service.get_order(db, order_id)
    if order.status == OrderStatus.AWAITING_PAYMENT.value:
        try:
            # страница «Проверяем оплату…» опрашивает статус; к банку ходим не чаще лимита
            await container.rate_limiter.hit(
                f"order-refresh:{client_ip(request)}", limit=30, window_seconds=60
            )
        except DomainError:
            return order_status_out(order, container.clock.now())
        order = await order_service.lock_order(db, order.id)
        await payments.refresh_order_payment(db, container, order)
    return order_status_out(order, container.clock.now())


@router.post("/orders/{order_id}/retry-payment", response_model=RetryOut, summary="Оплатить снова")
async def retry_payment(order_id: uuid.UUID, db: Db, container: Deps) -> RetryOut:
    order = await order_service.lock_order(db, order_id)
    payment = await payments.retry_payment(db, container, order)
    assert payment.payment_url
    return RetryOut(payment_url=payment.payment_url)


@router.post("/webhooks/tochka", response_model=Ok, summary="Вебхук Точки", include_in_schema=False)
async def tochka_webhook(request: Request, db: Db, container: Deps) -> Ok:
    await payments.handle_webhook(db, container, await request.body())
    return Ok()
