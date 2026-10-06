"""Цены и граммовки весового чая (SPEC 3.3)."""

import pytest

from app.domain.errors import DomainError
from app.domain.pricing import (
    TeaPricing,
    VariantKind,
    listing_price,
    pack_price_kop,
    price_per_100g_kop,
    price_per_gram_from_input,
    tea_pack_price_kop,
    unit_line_price_kop,
    validate_tea_variant,
    weight_options,
)


def make_tea(**overrides: object) -> TeaPricing:
    params: dict[str, object] = {
        "price_per_gram_kop": 1_200,  # 12 ₽/г
        "presets": (25, 50, 100),
        "cake_weight_grams": None,
        "cake_price_kop": None,
        "custom_enabled": False,
        "custom_min": 10,
        "custom_step": 5,
    }
    params.update(overrides)
    return TeaPricing(**params)  # type: ignore[arg-type]


class TestTeaPackPrice:
    def test_simple(self) -> None:
        # 100 г × 12 ₽/г = 1 200 ₽
        assert tea_pack_price_kop(100, 1_200) == 120_000

    def test_rounds_to_whole_rouble_half_up(self) -> None:
        # 25 г × 6,66 ₽/г = 166,5 ₽ → 167 ₽
        assert tea_pack_price_kop(25, 666) == 16_700

    def test_rounds_down_below_half(self) -> None:
        # 1 г × 1,49 ₽/г = 1,49 ₽ → 1 ₽
        assert tea_pack_price_kop(1, 149) == 100

    def test_zero_grams_is_error(self) -> None:
        with pytest.raises(DomainError):
            tea_pack_price_kop(0, 1_200)


class TestPricePerGramFromInput:
    """Владелец может вводить цену за 1 г, за 50 г или за 100 г — храним копейки за грамм."""

    def test_per_gram(self) -> None:
        assert price_per_gram_from_input(price_kop=1_250, per_grams=1) == 1_250

    def test_per_50g(self) -> None:
        # 650 ₽ за 50 г = 13 ₽/г
        assert price_per_gram_from_input(price_kop=65_000, per_grams=50) == 1_300

    def test_per_100g(self) -> None:
        # 1 234 ₽ за 100 г = 12,34 ₽/г
        assert price_per_gram_from_input(price_kop=123_400, per_grams=100) == 1_234

    def test_per_50g_with_odd_rubles_rounds(self) -> None:
        # 333 ₽ за 50 г = 6,66 ₽/г
        assert price_per_gram_from_input(price_kop=33_300, per_grams=50) == 666

    def test_unsupported_base(self) -> None:
        with pytest.raises(DomainError):
            price_per_gram_from_input(price_kop=1_000, per_grams=30)

    def test_zero_price_is_error(self) -> None:
        with pytest.raises(DomainError, match="цен"):
            price_per_gram_from_input(price_kop=0, per_grams=1)


def test_price_per_100g() -> None:
    assert price_per_100g_kop(1_234) == 123_400


class TestPackPriceWithCake:
    def test_cake_has_fixed_price(self) -> None:
        tea = make_tea(cake_weight_grams=357, cake_price_kop=350_000)
        assert pack_price_kop(tea, VariantKind.CAKE, 357) == 350_000

    def test_cake_without_fixed_price_uses_per_gram(self) -> None:
        tea = make_tea(cake_weight_grams=357)
        # 357 × 12 = 4 284 ₽
        assert pack_price_kop(tea, VariantKind.CAKE, 357) == 428_400

    def test_preset_uses_per_gram(self) -> None:
        tea = make_tea()
        assert pack_price_kop(tea, VariantKind.PRESET, 50) == 60_000


class TestValidateVariant:
    def test_preset_ok(self) -> None:
        validate_tea_variant(make_tea(), VariantKind.PRESET, 50)

    def test_preset_not_enabled(self) -> None:
        with pytest.raises(DomainError, match="нет такого варианта"):
            validate_tea_variant(make_tea(presets=(25, 50)), VariantKind.PRESET, 100)

    def test_cake_requires_cake_weight(self) -> None:
        with pytest.raises(DomainError, match="блин"):
            validate_tea_variant(make_tea(), VariantKind.CAKE, 357)

    def test_cake_weight_must_match(self) -> None:
        tea = make_tea(cake_weight_grams=357)
        with pytest.raises(DomainError, match="блин"):
            validate_tea_variant(tea, VariantKind.CAKE, 200)
        validate_tea_variant(tea, VariantKind.CAKE, 357)

    def test_custom_disabled(self) -> None:
        with pytest.raises(DomainError, match="Свой вес"):
            validate_tea_variant(make_tea(), VariantKind.CUSTOM, 70)

    def test_custom_below_min(self) -> None:
        tea = make_tea(custom_enabled=True)
        with pytest.raises(DomainError, match="не меньше 10 г"):
            validate_tea_variant(tea, VariantKind.CUSTOM, 5)

    def test_custom_step(self) -> None:
        tea = make_tea(custom_enabled=True)
        with pytest.raises(DomainError, match="кратен 5 г"):
            validate_tea_variant(tea, VariantKind.CUSTOM, 72)
        validate_tea_variant(tea, VariantKind.CUSTOM, 70)
        validate_tea_variant(tea, VariantKind.CUSTOM, 10)


class TestWeightOptions:
    def test_presets_sorted_and_availability(self) -> None:
        tea = make_tea(presets=(100, 25, 50))
        options = weight_options(tea, available_grams=60)
        assert [(o.grams, o.available) for o in options] == [
            (25, True),
            (50, True),
            (100, False),
        ]
        assert options[0].label == "25 г"
        assert options[0].price_kop == 30_000
        assert options[2].unavailable_reason == "нет в наличии"

    def test_cake_option(self) -> None:
        tea = make_tea(cake_weight_grams=357, cake_price_kop=350_000)
        options = weight_options(tea, available_grams=1000)
        cake = options[-1]
        assert cake.kind is VariantKind.CAKE
        assert cake.label == "Весь блин, 357 г"
        assert cake.price_kop == 350_000
        assert cake.available

    def test_cake_unavailable_when_not_enough(self) -> None:
        tea = make_tea(cake_weight_grams=357)
        cake = weight_options(tea, available_grams=300)[-1]
        assert not cake.available

    def test_nothing_available_at_zero_stock(self) -> None:
        options = weight_options(make_tea(), available_grams=0)
        assert all(not o.available for o in options)


class TestListingPrice:
    def test_min_preset(self) -> None:
        tea = make_tea(presets=(50, 25, 100))
        assert listing_price(tea) == (25, 30_000)

    def test_no_presets_falls_back_to_50g(self) -> None:
        tea = make_tea(presets=(), custom_enabled=True)
        assert listing_price(tea) == (50, 60_000)


class TestUnitLine:
    def test_unit_line(self) -> None:
        assert unit_line_price_kop(3, 150_000) == 450_000

    def test_qty_must_be_positive(self) -> None:
        with pytest.raises(DomainError):
            unit_line_price_kop(0, 150_000)
