"""Письма покупателям: код входа, статусы заказа. HTML в фирменном стиле + текстовая версия."""

from dataclasses import dataclass, field
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.domain.money import format_rub
from app.domain.orders import DELIVERY_LABELS, DeliveryMethod
from app.models import Order

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates" / "email"),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)

Email = tuple[str, str, str]  # тема, текст, html
DEFAULT_BASE_URL = "https://nsbtea.ru"


@dataclass(frozen=True, slots=True)
class Row:
    label: str
    value: str
    strong: bool = False


@dataclass(frozen=True, slots=True)
class Item:
    name: str
    amount: str


@dataclass(slots=True)
class Message:
    subject: str
    heading: str
    paragraphs: list[str]
    base_url: str = DEFAULT_BASE_URL
    code: str | None = None
    items: list[Item] = field(default_factory=list)
    totals: list[Row] = field(default_factory=list)
    after: list[str] = field(default_factory=list)
    button_url: str | None = None
    button_label: str | None = None

    def render(self) -> Email:
        html = _env.get_template("message.html").render(
            subject=self.subject,
            heading=self.heading,
            paragraphs=self.paragraphs,
            code=self.code,
            items=self.items,
            totals=self.totals,
            after=self.after,
            button_url=self.button_url,
            button_label=self.button_label,
            base_url=self.base_url,
            base_url_label=self.base_url.removeprefix("https://").removeprefix("http://"),
        )
        lines = [self.heading, "", *self.paragraphs]
        if self.code:
            lines += ["", self.code]
        if self.items:
            lines += ["", *(f"{i.name} — {i.amount}" for i in self.items)]
            lines += [f"{r.label}: {r.value}" for r in self.totals]
        if self.after:
            lines += ["", *self.after]
        if self.button_url:
            lines += ["", f"{self.button_label}: {self.button_url}"]
        lines += ["", "—", "НСБ Чай, Владимир", self.base_url]
        return self.subject, "\n".join(lines), html


def login_code_email(code: str, base_url: str = DEFAULT_BASE_URL) -> Email:
    return Message(
        subject="Код для входа в НСБ Чай",
        heading="Код для входа",
        paragraphs=["Введите этот код на сайте. Он действует 10 минут."],
        code=code,
        after=["Если вы не входили на сайт — просто проигнорируйте письмо."],
        base_url=base_url,
    ).render()


def _items(order: Order) -> list[Item]:
    return [
        Item(
            name=f"{i.product_name}, {i.variant_label}" + (f" × {i.qty}" if i.qty > 1 else "")
            if i.product_type == "tea"
            else f"{i.product_name}" + (f" × {i.qty}" if i.qty > 1 else ""),
            amount=format_rub(i.line_total_kop),
        )
        for i in order.items
    ]


def _totals(order: Order) -> list[Row]:
    rows: list[Row] = [Row("Товары", format_rub(order.items_total_kop))]
    discount = order.product_discount_kop + order.order_discount_kop
    if discount:
        rows.append(Row("Скидки", f"−{format_rub(discount)}"))
    if order.points_spent:
        rows.append(Row("Баллами", f"−{format_rub(order.points_spent * 100)}"))
    rows.append(
        Row(
            "Доставка",
            format_rub(order.delivery_kop) if order.delivery_kop else "бесплатно",
        )
    )
    rows.append(Row("Итого", format_rub(order.total_kop), strong=True))
    return rows


def _delivery_line(order: Order) -> str:
    try:
        label = DELIVERY_LABELS[DeliveryMethod(order.delivery_method)]
    except ValueError:
        label = order.delivery_method
    data = order.delivery_data
    detail = data.get("pvz_address") or data.get("address") or data.get("pickup_address")
    return f"{label}: {detail}" if detail else label


def order_confirmed_email(order: Order, base_url: str, *, paid: bool) -> Email:
    account = f"{base_url}/account/orders/{order.id}"
    points = (
        [f"За заказ начислим {order.points_to_earn} баллов, когда он будет выполнен."]
        if order.points_to_earn
        else []
    )
    return Message(
        subject=f"Заказ {order.display_number} {'оплачен' if paid else 'принят'}",
        heading=f"Спасибо! Заказ {order.display_number} {'оплачен' if paid else 'принят'}",
        paragraphs=[
            "Мы получили ваш заказ и скоро начнём его собирать."
            + (" Чек об оплате придёт отдельным письмом от банка." if paid else ""),
            _delivery_line(order),
        ],
        items=_items(order),
        totals=_totals(order),
        after=[
            *points,
            "Статус заказа и баллы — в личном кабинете. Войти можно по коду на эту почту, "
            "пароль не нужен.",
        ],
        button_url=account,
        button_label="Открыть заказ в кабинете",
        base_url=base_url,
    ).render()


def tracking_url(order: Order) -> str | None:
    if order.tracking_number and order.delivery_method.startswith("cdek"):
        return f"https://www.cdek.ru/ru/tracking?order_id={order.tracking_number}"
    return None


def order_shipped_email(order: Order, base_url: str) -> Email:
    url = tracking_url(order)
    if order.delivery_method == DeliveryMethod.PICKUP.value:
        heading = f"Заказ {order.display_number} готов к выдаче"
        text = [f"Заказ собран и ждёт вас. {order.delivery_data.get('pickup_address', '')}".strip()]
    elif order.delivery_method == DeliveryMethod.COURIER.value:
        heading = f"Заказ {order.display_number} передан курьеру"
        text = ["Курьер свяжется с вами перед доставкой."]
    else:
        heading = f"Заказ {order.display_number} передан в доставку"
        text = [f"Трек-номер СДЭК: {order.tracking_number}."]
    return Message(
        subject=heading,
        heading=heading,
        paragraphs=text,
        button_url=url or f"{base_url}/account/orders/{order.id}",
        button_label="Отследить посылку" if url else "Открыть заказ",
        base_url=base_url,
    ).render()


def order_completed_email(order: Order, base_url: str) -> Email:
    paragraphs = ["Спасибо, что выбрали «НСБ Чай»! Надеемся, чай понравится."]
    if order.points_earned:
        paragraphs.append(
            f"Мы начислили {order.points_earned} баллов — ими можно оплатить часть "
            "следующего заказа (1 балл = 1 ₽)."
        )
    return Message(
        subject=f"Заказ {order.display_number} выполнен"
        + (f" — начислено {order.points_earned} баллов" if order.points_earned else ""),
        heading="Заказ выполнен",
        paragraphs=paragraphs,
        button_url=f"{base_url}/catalog",
        button_label="Выбрать ещё чай",
        base_url=base_url,
    ).render()


def order_cancelled_email(order: Order, base_url: str) -> Email:
    return Message(
        subject=f"Заказ {order.display_number} отменён",
        heading=f"Заказ {order.display_number} отменён",
        paragraphs=[
            "Деньги вернутся на карту или счёт, с которых была оплата. По карте возврат "
            "обычно занимает от 3 до 7 рабочих дней, по СБП — быстрее.",
            "Если остались вопросы — напишите нам.",
        ],
        base_url=base_url,
    ).render()


def order_refunded_email(order: Order, amount_kop: int, base_url: str) -> Email:
    return Message(
        subject=f"Возврат по заказу {order.display_number}",
        heading="Оформили возврат",
        paragraphs=[
            f"Вернули {format_rub(amount_kop)} по заказу {order.display_number}. Деньги придут "
            "туда же, откуда была оплата: по карте — обычно 3–7 рабочих дней.",
        ],
        base_url=base_url,
    ).render()
