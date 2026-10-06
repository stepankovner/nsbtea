"""Скидки и правила их сочетания (SPEC 7.2).

Порядок применения:
1. Товарные скидки (акция или «чай недели») — на строку, максимум одна, берётся наибольшая.
2. Скидка на заказ: промокод ИЛИ приветственная скидка — выгоднейшая из двух.
   Не действует на строки с товарной скидкой (кроме промокода с флагом «и на акционные»).
3. Баллы — последними (см. loyalty.py), к сумме после всех скидок.

Все проценты округляются до целого рубля, поэтому итоги строк — целые рубли,
кроме распределённой скидки на заказ (её доля в строке может содержать копейки).
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum

from app.domain.errors import DomainError
from app.domain.money import format_rub, percent_of_rub, round_half_up_div, round_to_rub
from app.domain.pricing import ProductType
from app.domain.receipt import allocate


class PromotionKind(StrEnum):
    SALE = "sale"
    THURSDAY = "thursday"


class OrderDiscountSource(StrEnum):
    PROMO_CODE = "promo_code"
    WELCOME = "welcome"


def _validate_value(percent: int | None, amount_kop: int | None) -> None:
    if (percent is None) == (amount_kop is None):
        raise DomainError("Укажите скидку либо в процентах, либо в рублях")
    if percent is not None and not 1 <= percent <= 99:
        raise DomainError("Процент скидки — от 1 до 99", field="percent")
    if amount_kop is not None and amount_kop <= 0:
        raise DomainError("Сумма скидки должна быть больше нуля", field="amount")


def _describe(percent: int | None, amount_kop: int | None) -> str:
    if percent is not None:
        return f"−{percent}%"
    assert amount_kop is not None
    return f"−{format_rub(amount_kop)}"


@dataclass(frozen=True, slots=True)
class DiscountLine:
    key: str
    product_id: uuid.UUID
    product_name: str
    category_ids: frozenset[uuid.UUID]
    type: ProductType
    grams_total: int
    units: int
    amount_kop: int


@dataclass(frozen=True, slots=True)
class ProductPromotion:
    id: uuid.UUID
    kind: PromotionKind
    title: str
    percent: int | None
    amount_kop: int | None  # для штучных — за 1 шт., для чая — за каждые 100 г
    product_ids: frozenset[uuid.UUID]
    category_ids: frozenset[uuid.UUID]

    def __post_init__(self) -> None:
        _validate_value(self.percent, self.amount_kop)

    def matches(self, line: DiscountLine) -> bool:
        return line.product_id in self.product_ids or bool(line.category_ids & self.category_ids)

    @property
    def badge(self) -> str:
        return _describe(self.percent, self.amount_kop)


@dataclass(frozen=True, slots=True)
class PromoCodeRule:
    id: uuid.UUID
    code: str
    percent: int | None
    amount_kop: int | None
    min_order_kop: int = 0
    first_order_only: bool = False
    applies_to_discounted: bool = False
    product_ids: frozenset[uuid.UUID] = field(default_factory=frozenset)
    category_ids: frozenset[uuid.UUID] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        _validate_value(self.percent, self.amount_kop)

    @property
    def restricted(self) -> bool:
        return bool(self.product_ids or self.category_ids)

    def matches(self, line: DiscountLine) -> bool:
        if not self.restricted:
            return True
        return line.product_id in self.product_ids or bool(line.category_ids & self.category_ids)


@dataclass(frozen=True, slots=True)
class WelcomeRule:
    percent: int

    def __post_init__(self) -> None:
        if not 1 <= self.percent <= 99:
            raise DomainError("Приветственная скидка — от 1 до 99%")


@dataclass(frozen=True, slots=True)
class LineResult:
    key: str
    amount_kop: int
    product_discount_kop: int
    promotion: ProductPromotion | None
    order_discount_kop: int

    @property
    def after_product_discount_kop(self) -> int:
        return self.amount_kop - self.product_discount_kop

    @property
    def total_kop(self) -> int:
        return self.amount_kop - self.product_discount_kop - self.order_discount_kop


@dataclass(frozen=True, slots=True)
class DiscountResult:
    lines: tuple[LineResult, ...]
    items_total_kop: int
    product_discount_kop: int
    order_discount_kop: int
    order_discount_source: OrderDiscountSource | None
    promo_code_applied: bool
    promo_code_message: str | None
    notes: tuple[str, ...]

    @property
    def items_after_discounts_kop(self) -> int:
        return self.items_total_kop - self.product_discount_kop - self.order_discount_kop


def product_discount_kop(promotion: ProductPromotion, line: DiscountLine) -> int:
    if promotion.percent is not None:
        discount = percent_of_rub(line.amount_kop, promotion.percent)
    else:
        assert promotion.amount_kop is not None
        if line.type is ProductType.UNIT:
            discount = promotion.amount_kop * line.units
        else:
            discount = round_to_rub(round_half_up_div(promotion.amount_kop * line.grams_total, 100))
    return min(discount, line.amount_kop)


def _best_promotion(
    line: DiscountLine, promotions: Sequence[ProductPromotion]
) -> tuple[ProductPromotion | None, int, list[ProductPromotion]]:
    candidates = [(product_discount_kop(p, line), p) for p in promotions if p.matches(line)]
    if not candidates:
        return None, 0, []
    # при равенстве — «чай недели» (он заметнее покупателю), затем по названию для стабильности
    candidates.sort(key=lambda c: (-c[0], c[1].kind is not PromotionKind.THURSDAY, c[1].title))
    best_amount, best = candidates[0]
    if best_amount <= 0:
        return None, 0, []
    return best, best_amount, [p for _, p in candidates[1:]]


@dataclass(slots=True)
class _OrderDiscountCandidate:
    amount_kop: int
    eligible: list[int]  # индексы строк
    bases: list[int]


def _order_discount(
    percent: int | None, amount_kop: int | None, bases: list[int], eligible: list[int]
) -> _OrderDiscountCandidate:
    eligible_sum = sum(bases[i] for i in eligible)
    if percent is not None:
        value = percent_of_rub(eligible_sum, percent)
    else:
        assert amount_kop is not None
        value = min(amount_kop, eligible_sum)
    return _OrderDiscountCandidate(
        amount_kop=value, eligible=eligible, bases=[bases[i] for i in eligible]
    )


def calculate_discounts(
    lines: Sequence[DiscountLine],
    promotions: Sequence[ProductPromotion],
    *,
    promo_code: PromoCodeRule | None = None,
    welcome: WelcomeRule | None = None,
    is_first_order: bool | None = None,
) -> DiscountResult:
    """Посчитать скидки для корзины или заказа.

    `is_first_order`: True/False — известно; None — гость, email ещё не указан
    (скидки «на первый заказ» применяются предварительно и перепроверяются при оформлении).
    """
    notes: list[str] = []
    product_discounts: list[int] = []
    applied_promotions: list[ProductPromotion | None] = []

    for line in lines:
        best, amount, others = _best_promotion(line, promotions)
        product_discounts.append(amount)
        applied_promotions.append(best)
        if best is not None and others:
            skipped = ", ".join(f"«{p.title}» {p.badge}" for p in others)
            notes.append(
                f"На «{line.product_name}» действует «{best.title}» {best.badge} — "
                f"выгоднее, чем {skipped}. Скидки на один товар не суммируются."
            )

    bases = [ln.amount_kop - d for ln, d in zip(lines, product_discounts, strict=True)]
    items_total = sum(ln.amount_kop for ln in lines)
    after_products = sum(bases)
    discounted = [i for i, d in enumerate(product_discounts) if d > 0]

    # --- промокод
    promo_candidate: _OrderDiscountCandidate | None = None
    promo_message: str | None = None
    if promo_code is not None:
        promo_candidate, promo_message = _evaluate_promo_code(
            promo_code, lines, bases, discounted, after_products, is_first_order
        )
        if promo_candidate is not None and not promo_code.applies_to_discounted:
            for i in discounted:
                if promo_code.matches(lines[i]):
                    notes.append(
                        f"Промокод не применяется к «{lines[i].product_name}» — "
                        "на этот товар уже есть скидка."
                    )

    # --- приветственная скидка
    welcome_candidate: _OrderDiscountCandidate | None = None
    if welcome is not None and is_first_order is not False:
        eligible = [i for i in range(len(lines)) if i not in discounted and bases[i] > 0]
        if eligible:
            welcome_candidate = _order_discount(welcome.percent, None, bases, eligible)
            if welcome_candidate.amount_kop <= 0:
                welcome_candidate = None

    # --- выбор выгоднейшей скидки на заказ
    chosen: _OrderDiscountCandidate | None = None
    source: OrderDiscountSource | None = None
    promo_applied = False
    if promo_candidate is not None and (
        welcome_candidate is None or promo_candidate.amount_kop >= welcome_candidate.amount_kop
    ):
        chosen, source, promo_applied = promo_candidate, OrderDiscountSource.PROMO_CODE, True
        if welcome_candidate is not None:
            notes.append(
                f"Приветственная скидка {welcome.percent if welcome else 0}% не суммируется "
                "с промокодом — применили более выгодную (промокод)."
            )
    elif welcome_candidate is not None:
        chosen, source = welcome_candidate, OrderDiscountSource.WELCOME
        if promo_candidate is not None:
            welcome_pct = welcome.percent if welcome else 0
            promo_message = (
                f"Промокод даёт меньшую скидку, чем приветственная {welcome_pct}% — "
                "применили приветственную. Скидки на заказ не суммируются."
            )

    if source is OrderDiscountSource.WELCOME and is_first_order is None:
        notes.append(
            "Скидка на первый заказ применена предварительно — проверим по email при оформлении."
        )

    order_shares = [0] * len(lines)
    if chosen is not None:
        for idx, share in zip(
            chosen.eligible, allocate(chosen.amount_kop, chosen.bases), strict=True
        ):
            order_shares[idx] = share

    result_lines = tuple(
        LineResult(
            key=line.key,
            amount_kop=line.amount_kop,
            product_discount_kop=product_discounts[i],
            promotion=applied_promotions[i],
            order_discount_kop=order_shares[i],
        )
        for i, line in enumerate(lines)
    )
    return DiscountResult(
        lines=result_lines,
        items_total_kop=items_total,
        product_discount_kop=sum(product_discounts),
        order_discount_kop=chosen.amount_kop if chosen else 0,
        order_discount_source=source,
        promo_code_applied=promo_applied,
        promo_code_message=promo_message,
        notes=tuple(notes),
    )


def _evaluate_promo_code(
    rule: PromoCodeRule,
    lines: Sequence[DiscountLine],
    bases: list[int],
    discounted: list[int],
    after_products: int,
    is_first_order: bool | None,
) -> tuple[_OrderDiscountCandidate | None, str | None]:
    if not lines:
        return None, "Добавьте товары в корзину, чтобы применить промокод"
    if rule.first_order_only and is_first_order is False:
        return None, "Промокод действует только на первый заказ"
    if after_products < rule.min_order_kop:
        return None, f"Промокод действует при заказе от {format_rub(rule.min_order_kop)}"

    matching = [i for i, ln in enumerate(lines) if rule.matches(ln)]
    if not matching:
        return None, "Промокод не действует на товары в корзине"
    eligible = [
        i for i in matching if (rule.applies_to_discounted or i not in discounted) and bases[i] > 0
    ]
    if not eligible:
        return None, "Промокод не действует на товары со скидкой"
    candidate = _order_discount(rule.percent, rule.amount_kop, bases, eligible)
    if candidate.amount_kop <= 0:
        return None, "Сумма товаров слишком мала для этого промокода"
    return candidate, None
