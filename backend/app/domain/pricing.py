"""Цены и варианты веса (SPEC 3.3).

Цена весового чая хранится в копейках за 1 грамм. Цена упаковки
= граммы × цена за грамм, округлённая до целого рубля (half-up).
"""

from dataclasses import dataclass
from enum import StrEnum

from app.domain.errors import DomainError
from app.domain.money import round_half_up_div

MAX_PRICE_PER_GRAM_KOP = 1_000_000  # 10 000 ₽/г — всё, что выше, почти наверняка опечатка
PRICE_INPUT_BASES = (1, 50, 100)
LISTING_FALLBACK_GRAMS = 50


class ProductType(StrEnum):
    TEA = "tea"
    UNIT = "unit"


class VariantKind(StrEnum):
    PRESET = "preset"
    CAKE = "cake"
    CUSTOM = "custom"


@dataclass(frozen=True, slots=True)
class TeaPricing:
    price_per_gram_kop: int
    presets: tuple[int, ...]
    cake_weight_grams: int | None = None
    cake_price_kop: int | None = None
    custom_enabled: bool = False
    custom_min: int = 10
    custom_step: int = 5


@dataclass(frozen=True, slots=True)
class WeightOption:
    kind: VariantKind
    grams: int
    label: str
    price_kop: int
    available: bool

    @property
    def unavailable_reason(self) -> str | None:
        return None if self.available else "нет в наличии"


def tea_pack_price_kop(grams: int, price_per_gram_kop: int) -> int:
    if grams <= 0:
        raise DomainError("Вес должен быть больше нуля")
    if price_per_gram_kop <= 0:
        raise DomainError("Цена должна быть больше нуля")
    return round_half_up_div(grams * price_per_gram_kop, 100) * 100


def unit_line_price_kop(qty: int, unit_price_kop: int) -> int:
    if qty <= 0:
        raise DomainError("Количество должно быть больше нуля")
    return qty * unit_price_kop


def price_per_gram_from_input(*, price_kop: int, per_grams: int) -> int:
    """Перевести цену «за 1 г / 50 г / 100 г», которую ввёл владелец, в копейки за грамм."""
    if per_grams not in PRICE_INPUT_BASES:
        raise DomainError("Цену можно указать за 1 г, 50 г или 100 г")
    if price_kop <= 0:
        raise DomainError("Укажите цену больше нуля", field="price")
    result = round_half_up_div(price_kop, per_grams)
    if result > MAX_PRICE_PER_GRAM_KOP:
        raise DomainError("Слишком большая цена — проверьте, нет ли лишних нулей", field="price")
    return max(result, 1)


def price_per_100g_kop(price_per_gram_kop: int) -> int:
    return price_per_gram_kop * 100


def pack_price_kop(tea: TeaPricing, kind: VariantKind, grams: int) -> int:
    if kind is VariantKind.CAKE and tea.cake_price_kop is not None:
        return tea.cake_price_kop
    return tea_pack_price_kop(grams, tea.price_per_gram_kop)


def validate_tea_variant(tea: TeaPricing, kind: VariantKind, grams: int) -> None:
    if kind is VariantKind.PRESET:
        if grams not in tea.presets:
            raise DomainError(f"У этого чая нет такого варианта веса: {grams} г")
        return
    if kind is VariantKind.CAKE:
        if tea.cake_weight_grams is None:
            raise DomainError("Этот чай не продаётся целым блином")
        if grams != tea.cake_weight_grams:
            raise DomainError(f"Вес блина — {tea.cake_weight_grams} г")
        return
    if not tea.custom_enabled:
        raise DomainError("Свой вес для этого чая недоступен")
    if grams < tea.custom_min:
        raise DomainError(f"Вес должен быть не меньше {tea.custom_min} г")
    if grams % tea.custom_step != 0:
        raise DomainError(f"Вес должен быть кратен {tea.custom_step} г")


def variant_label(kind: VariantKind, grams: int) -> str:
    if kind is VariantKind.CAKE:
        return f"Весь блин, {grams} г"
    return f"{grams} г"


def weight_options(tea: TeaPricing, available_grams: int) -> list[WeightOption]:
    options = [
        WeightOption(
            kind=VariantKind.PRESET,
            grams=grams,
            label=variant_label(VariantKind.PRESET, grams),
            price_kop=pack_price_kop(tea, VariantKind.PRESET, grams),
            available=grams <= available_grams,
        )
        for grams in sorted(set(tea.presets))
    ]
    if tea.cake_weight_grams:
        options.append(
            WeightOption(
                kind=VariantKind.CAKE,
                grams=tea.cake_weight_grams,
                label=variant_label(VariantKind.CAKE, tea.cake_weight_grams),
                price_kop=pack_price_kop(tea, VariantKind.CAKE, tea.cake_weight_grams),
                available=tea.cake_weight_grams <= available_grams,
            )
        )
    return options


def listing_price(tea: TeaPricing) -> tuple[int, int]:
    """Цена для списка товаров: за минимальный включённый пресет (или 50 г)."""
    grams = min(tea.presets) if tea.presets else LISTING_FALLBACK_GRAMS
    return grams, tea_pack_price_kop(grams, tea.price_per_gram_kop)
