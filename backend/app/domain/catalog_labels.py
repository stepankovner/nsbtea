"""Справочники характеристик чая: значения и подписи для людей."""

from enum import StrEnum


class TeaShape(StrEnum):
    CAKE = "cake"
    BRICK = "brick"
    LOOSE = "loose"
    TUOCHA = "tuocha"
    OTHER = "other"


class TeaEffect(StrEnum):
    ENERGIZING = "energizing"
    CALMING = "calming"
    BALANCED = "balanced"


class BrewMethod(StrEnum):
    GONGFU = "gongfu"
    EUROPEAN = "european"
    BOILING = "boiling"
    THERMOS = "thermos"
    COLD = "cold"


SHAPE_LABELS: dict[TeaShape, str] = {
    TeaShape.CAKE: "Блин",
    TeaShape.BRICK: "Кирпич",
    TeaShape.LOOSE: "Рассыпной",
    TeaShape.TUOCHA: "Точа",
    TeaShape.OTHER: "Другая",
}

EFFECT_LABELS: dict[TeaEffect, str] = {
    TeaEffect.ENERGIZING: "Бодрит",
    TeaEffect.CALMING: "Успокаивает",
    TeaEffect.BALANCED: "Сбалансированный",
}

BREW_METHOD_LABELS: dict[BrewMethod, str] = {
    BrewMethod.GONGFU: "Пролив (гунфу)",
    BrewMethod.EUROPEAN: "Европейский",
    BrewMethod.BOILING: "Варка",
    BrewMethod.THERMOS: "Термос",
    BrewMethod.COLD: "Холодное заваривание",
}

ATTRIBUTE_LABELS: dict[str, str] = {
    "tea_type": "Тип",
    "region": "Регион",
    "factory": "Производитель / фабрика",
    "harvest_year": "Год сбора",
    "pressing_year": "Год прессовки",
    "fermentation": "Степень ферментации",
    "shape": "Форма",
    "effect": "Эффект",
}
