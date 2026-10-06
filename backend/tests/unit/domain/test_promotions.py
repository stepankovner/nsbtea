"""Скидки и правила их сочетания (SPEC 7.2).

1. На товар действует максимум одна товарная скидка (акция или четверг) — наибольшая.
2. Промокод и приветственная скидка не суммируются (выгоднейшая) и не действуют
   на товары с товарной скидкой (кроме промокода с «действует и на акционные»).
3. Баллы — последними (см. test_loyalty).
4. Клиенту видно, какая скидка применилась и почему другая — нет.
"""

import uuid

import pytest

from app.domain.errors import DomainError
from app.domain.pricing import ProductType
from app.domain.promotions import (
    DiscountLine,
    OrderDiscountSource,
    ProductPromotion,
    PromoCodeRule,
    PromotionKind,
    WelcomeRule,
    calculate_discounts,
    product_discount_kop,
)

CAT_PUER = uuid.uuid4()
CAT_OOLONG = uuid.uuid4()
CAT_TEAWARE = uuid.uuid4()


def tea_line(
    name: str, amount_rub: int, grams: int = 100, cat: uuid.UUID = CAT_PUER
) -> DiscountLine:
    return DiscountLine(
        key=name,
        product_id=uuid.uuid5(uuid.NAMESPACE_DNS, name),
        product_name=name,
        category_ids=frozenset({cat}),
        type=ProductType.TEA,
        grams_total=grams,
        units=0,
        amount_kop=amount_rub * 100,
    )


def unit_line(name: str, amount_rub: int, units: int = 1) -> DiscountLine:
    return DiscountLine(
        key=name,
        product_id=uuid.uuid5(uuid.NAMESPACE_DNS, name),
        product_name=name,
        category_ids=frozenset({CAT_TEAWARE}),
        type=ProductType.UNIT,
        grams_total=0,
        units=units,
        amount_kop=amount_rub * 100,
    )


def promo(
    kind: PromotionKind = PromotionKind.SALE,
    percent: int | None = None,
    amount_rub: int | None = None,
    products: tuple[DiscountLine, ...] = (),
    categories: tuple[uuid.UUID, ...] = (),
    title: str = "Акция",
) -> ProductPromotion:
    return ProductPromotion(
        id=uuid.uuid4(),
        kind=kind,
        title=title,
        percent=percent,
        amount_kop=amount_rub * 100 if amount_rub is not None else None,
        product_ids=frozenset(p.product_id for p in products),
        category_ids=frozenset(categories),
    )


def code(
    percent: int | None = None,
    amount_rub: int | None = None,
    min_order_rub: int = 0,
    first_order_only: bool = False,
    applies_to_discounted: bool = False,
    products: tuple[DiscountLine, ...] = (),
    categories: tuple[uuid.UUID, ...] = (),
) -> PromoCodeRule:
    return PromoCodeRule(
        id=uuid.uuid4(),
        code="CHAI",
        percent=percent,
        amount_kop=amount_rub * 100 if amount_rub is not None else None,
        min_order_kop=min_order_rub * 100,
        first_order_only=first_order_only,
        applies_to_discounted=applies_to_discounted,
        product_ids=frozenset(p.product_id for p in products),
        category_ids=frozenset(categories),
    )


class TestPromotionValidation:
    def test_needs_percent_or_amount(self) -> None:
        with pytest.raises(DomainError):
            ProductPromotion(
                id=uuid.uuid4(),
                kind=PromotionKind.SALE,
                title="x",
                percent=None,
                amount_kop=None,
                product_ids=frozenset(),
                category_ids=frozenset(),
            )

    def test_not_both(self) -> None:
        with pytest.raises(DomainError):
            ProductPromotion(
                id=uuid.uuid4(),
                kind=PromotionKind.SALE,
                title="x",
                percent=10,
                amount_kop=100,
                product_ids=frozenset(),
                category_ids=frozenset(),
            )

    def test_percent_range(self) -> None:
        with pytest.raises(DomainError):
            promo(percent=0)
        with pytest.raises(DomainError):
            promo(percent=100)


class TestProductDiscountAmount:
    def test_percent(self) -> None:
        line = tea_line("Шу", 1_255)
        assert product_discount_kop(promo(percent=20, products=(line,)), line) == 25_100

    def test_fixed_per_unit(self) -> None:
        line = unit_line("Гайвань", 1_500, units=3)
        assert product_discount_kop(promo(amount_rub=200, products=(line,)), line) == 60_000

    def test_fixed_for_tea_is_per_100g(self) -> None:
        line = tea_line("Шу", 650, grams=50)
        # 100 ₽ за каждые 100 г → за 50 г = 50 ₽
        assert product_discount_kop(promo(amount_rub=100, products=(line,)), line) == 5_000

    def test_fixed_never_exceeds_line(self) -> None:
        line = unit_line("Чашка", 300)
        assert product_discount_kop(promo(amount_rub=500, products=(line,)), line) == 30_000


class TestProductPromotions:
    def test_no_promotions(self) -> None:
        result = calculate_discounts([tea_line("Шу", 1_000)], [])
        assert result.items_total_kop == 100_000
        assert result.product_discount_kop == 0
        assert result.order_discount_kop == 0
        assert result.items_after_discounts_kop == 100_000
        assert result.notes == ()

    def test_by_category(self) -> None:
        shu = tea_line("Шу", 1_000, cat=CAT_PUER)
        tgy = tea_line("Те Гуань Инь", 800, cat=CAT_OOLONG)
        result = calculate_discounts([shu, tgy], [promo(percent=10, categories=(CAT_PUER,))])
        assert result.lines[0].product_discount_kop == 10_000
        assert result.lines[1].product_discount_kop == 0

    def test_biggest_product_discount_wins(self) -> None:
        line = tea_line("Да Хун Пао", 1_400)
        sale = promo(percent=10, products=(line,), title="Осенняя акция")
        thursday = promo(
            kind=PromotionKind.THURSDAY, percent=20, products=(line,), title="Чай недели"
        )
        result = calculate_discounts([line], [sale, thursday])
        assert result.lines[0].product_discount_kop == 28_000
        assert result.lines[0].promotion is thursday
        assert any("выгоднее" in n for n in result.notes)

    def test_discounts_never_sum_on_one_product(self) -> None:
        line = tea_line("Да Хун Пао", 1_000)
        result = calculate_discounts(
            [line], [promo(percent=10, products=(line,)), promo(percent=15, products=(line,))]
        )
        assert result.product_discount_kop == 15_000


class TestPromoCode:
    def test_percent_on_whole_cart(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000), unit_line("Чашка", 500)], [], promo_code=code(percent=10)
        )
        assert result.order_discount_kop == 15_000
        assert result.order_discount_source is OrderDiscountSource.PROMO_CODE
        assert result.promo_code_applied
        assert result.items_after_discounts_kop == 135_000
        # скидка заказа распределена по строкам пропорционально
        assert [ln.order_discount_kop for ln in result.lines] == [10_000, 5_000]

    def test_fixed_amount(self) -> None:
        result = calculate_discounts([tea_line("Шу", 1_000)], [], promo_code=code(amount_rub=300))
        assert result.order_discount_kop == 30_000

    def test_fixed_amount_capped_by_eligible_sum(self) -> None:
        result = calculate_discounts([tea_line("Шу", 200)], [], promo_code=code(amount_rub=300))
        assert result.order_discount_kop == 20_000
        assert result.items_after_discounts_kop == 0

    def test_min_order_not_reached(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)], [], promo_code=code(percent=10, min_order_rub=2_000)
        )
        assert not result.promo_code_applied
        assert result.order_discount_kop == 0
        assert result.promo_code_message == "Промокод действует при заказе от 2 000 ₽"

    def test_min_order_counts_after_product_discounts(self) -> None:
        line = tea_line("Шу", 2_000)
        result = calculate_discounts(
            [line],
            [promo(percent=10, products=(line,))],
            promo_code=code(percent=10, min_order_rub=2_000, applies_to_discounted=True),
        )
        assert not result.promo_code_applied  # 1 800 ₽ < 2 000 ₽

    def test_not_applied_to_discounted_products(self) -> None:
        sale_line = tea_line("Да Хун Пао", 1_000)
        plain = tea_line("Шу", 1_000)
        result = calculate_discounts(
            [sale_line, plain],
            [promo(percent=20, products=(sale_line,))],
            promo_code=code(percent=10),
        )
        assert result.lines[0].order_discount_kop == 0
        assert result.lines[1].order_discount_kop == 10_000
        assert any("«Да Хун Пао»" in n and "уже есть скидка" in n for n in result.notes)

    def test_applies_to_discounted_when_flag_set(self) -> None:
        sale_line = tea_line("Да Хун Пао", 1_000)
        result = calculate_discounts(
            [sale_line],
            [promo(percent=20, products=(sale_line,))],
            promo_code=code(percent=10, applies_to_discounted=True),
        )
        # 10% от уже уценённых 800 ₽
        assert result.lines[0].product_discount_kop == 20_000
        assert result.lines[0].order_discount_kop == 8_000

    def test_only_discounted_products_in_cart(self) -> None:
        sale_line = tea_line("Да Хун Пао", 1_000)
        result = calculate_discounts(
            [sale_line], [promo(percent=20, products=(sale_line,))], promo_code=code(percent=10)
        )
        assert not result.promo_code_applied
        assert result.promo_code_message == "Промокод не действует на товары со скидкой"

    def test_restricted_to_category(self) -> None:
        shu = tea_line("Шу", 1_000, cat=CAT_PUER)
        cup = unit_line("Чашка", 500)
        result = calculate_discounts(
            [shu, cup], [], promo_code=code(percent=10, categories=(CAT_PUER,))
        )
        assert [ln.order_discount_kop for ln in result.lines] == [10_000, 0]

    def test_restricted_and_nothing_matches(self) -> None:
        cup = unit_line("Чашка", 500)
        result = calculate_discounts([cup], [], promo_code=code(percent=10, categories=(CAT_PUER,)))
        assert not result.promo_code_applied
        assert result.promo_code_message == "Промокод не действует на товары в корзине"

    def test_first_order_only_for_returning_customer(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)],
            [],
            promo_code=code(percent=10, first_order_only=True),
            is_first_order=False,
        )
        assert not result.promo_code_applied
        assert result.promo_code_message == "Промокод действует только на первый заказ"

    def test_first_order_only_unknown_guest_is_tentative(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)],
            [],
            promo_code=code(percent=10, first_order_only=True),
            is_first_order=None,
        )
        assert result.promo_code_applied


class TestWelcomeDiscount:
    def test_first_order(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)], [], welcome=WelcomeRule(percent=10), is_first_order=True
        )
        assert result.order_discount_kop == 10_000
        assert result.order_discount_source is OrderDiscountSource.WELCOME

    def test_not_for_returning_customer(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)], [], welcome=WelcomeRule(percent=10), is_first_order=False
        )
        assert result.order_discount_kop == 0
        assert result.order_discount_source is None

    def test_unknown_guest_gets_tentative_discount_with_note(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)], [], welcome=WelcomeRule(percent=10), is_first_order=None
        )
        assert result.order_discount_kop == 10_000
        assert any("первый заказ" in n for n in result.notes)

    def test_not_on_discounted_products(self) -> None:
        sale_line = tea_line("Да Хун Пао", 1_000)
        plain = tea_line("Шу", 500)
        result = calculate_discounts(
            [sale_line, plain],
            [promo(percent=20, products=(sale_line,))],
            welcome=WelcomeRule(percent=10),
            is_first_order=True,
        )
        assert result.lines[0].order_discount_kop == 0
        assert result.lines[1].order_discount_kop == 5_000


class TestPromoVsWelcome:
    def test_better_promo_code_wins(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)],
            [],
            promo_code=code(percent=15),
            welcome=WelcomeRule(percent=10),
            is_first_order=True,
        )
        assert result.order_discount_kop == 15_000
        assert result.order_discount_source is OrderDiscountSource.PROMO_CODE
        assert result.promo_code_applied
        assert any("не суммируется" in n for n in result.notes)

    def test_better_welcome_wins(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)],
            [],
            promo_code=code(amount_rub=50),
            welcome=WelcomeRule(percent=10),
            is_first_order=True,
        )
        assert result.order_discount_kop == 10_000
        assert result.order_discount_source is OrderDiscountSource.WELCOME
        assert not result.promo_code_applied
        assert result.promo_code_message is not None
        assert "приветственн" in result.promo_code_message

    def test_equal_prefers_promo_code(self) -> None:
        result = calculate_discounts(
            [tea_line("Шу", 1_000)],
            [],
            promo_code=code(percent=10),
            welcome=WelcomeRule(percent=10),
            is_first_order=True,
        )
        assert result.order_discount_source is OrderDiscountSource.PROMO_CODE


class TestInvariants:
    @pytest.mark.parametrize("pct", [1, 7, 13, 33, 50, 99])
    def test_line_totals_sum_to_items_after(self, pct: int) -> None:
        lines = [tea_line("A", 333), tea_line("B", 777, grams=25), unit_line("C", 1_001, units=3)]
        result = calculate_discounts(lines, [], promo_code=code(percent=pct))
        assert sum(ln.total_kop for ln in result.lines) == result.items_after_discounts_kop
        assert result.items_after_discounts_kop == (
            result.items_total_kop - result.product_discount_kop - result.order_discount_kop
        )
        assert all(ln.total_kop >= 0 for ln in result.lines)

    def test_empty_cart(self) -> None:
        result = calculate_discounts([], [], promo_code=code(percent=10))
        assert result.items_total_kop == 0
        assert not result.promo_code_applied
