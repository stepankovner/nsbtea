"""Доставка (SPEC 6): вес посылки, коробки, пороги бесплатной доставки."""

import pytest

from app.domain.errors import DomainError
from app.domain.shipping import Box, choose_box, delivery_price, parcel_weight

BOXES = (
    Box(code="m", name="Средняя", max_weight_grams=3_000, length_cm=30, width_cm=20, height_cm=15),
    Box(
        code="s", name="Маленькая", max_weight_grams=1_000, length_cm=20, width_cm=15, height_cm=10
    ),
    Box(code="l", name="Большая", max_weight_grams=10_000, length_cm=40, width_cm=30, height_cm=30),
)


class TestParcelWeight:
    def test_sum(self) -> None:
        assert (
            parcel_weight(tea_grams=350, unit_weights_grams=[400, 400], packaging_grams=50) == 1_200
        )

    def test_only_packaging_for_empty(self) -> None:
        assert parcel_weight(tea_grams=0, unit_weights_grams=[], packaging_grams=50) == 50

    def test_negative_rejected(self) -> None:
        with pytest.raises(DomainError):
            parcel_weight(tea_grams=-1, unit_weights_grams=[], packaging_grams=50)


class TestChooseBox:
    def test_smallest_that_fits(self) -> None:
        assert choose_box(BOXES, 800).code == "s"
        assert choose_box(BOXES, 1_000).code == "s"
        assert choose_box(BOXES, 1_001).code == "m"

    def test_heavier_than_all_uses_largest(self) -> None:
        assert choose_box(BOXES, 50_000).code == "l"

    def test_no_boxes(self) -> None:
        with pytest.raises(DomainError, match="коробк"):
            choose_box((), 100)


class TestDeliveryPrice:
    def test_paid(self) -> None:
        assert delivery_price(base_kop=30_000, items_kop=100_000, free_from_kop=None) == 30_000

    def test_free_from_threshold(self) -> None:
        assert delivery_price(base_kop=30_000, items_kop=300_000, free_from_kop=300_000) == 0

    def test_below_threshold(self) -> None:
        assert delivery_price(base_kop=30_000, items_kop=299_900, free_from_kop=300_000) == 30_000

    def test_rounds_up_to_rouble(self) -> None:
        # стоимость СДЭК бывает с копейками — показываем и берём целые рубли (вверх)
        assert delivery_price(base_kop=35_050, items_kop=0, free_from_kop=None) == 35_100
