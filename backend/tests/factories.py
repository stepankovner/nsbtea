"""Быстрое создание тестовых данных напрямую в БД."""

import io
import uuid
from typing import Any

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.slugs import slugify
from app.domain.texts import normalize_search
from app.models import Category, Product
from app.models.catalog import ProductStatus


async def make_category(
    db: AsyncSession,
    name: str = "Улун",
    *,
    parent: Category | None = None,
    tile_color: str = "oolong",
    sort_order: int = 0,
    is_visible: bool = True,
) -> Category:
    category = Category(
        name=name,
        slug=f"{slugify(name)}-{uuid.uuid4().hex[:4]}",
        parent_id=parent.id if parent else None,
        tile_color=tile_color,
        sort_order=sort_order,
        is_visible=is_visible,
    )
    db.add(category)
    await db.commit()
    return category


async def make_tea(
    db: AsyncSession,
    name: str = "Да Хун Пао",
    *,
    category: Category | None = None,
    price_per_gram_kop: int = 2_800,
    stock: int = 500,
    presets: list[int] | None = None,
    status: ProductStatus = ProductStatus.PUBLISHED,
    **fields: Any,
) -> Product:
    product = Product(
        type="tea",
        name=name,
        slug=f"{slugify(name)}-{uuid.uuid4().hex[:4]}",
        category_id=category.id if category else None,
        status=status.value,
        price_per_gram_kop=price_per_gram_kop,
        stock=stock,
        weight_presets=presets if presets is not None else [25, 50, 100],
        search_text=normalize_search(name),
        **fields,
    )
    db.add(product)
    await db.commit()
    return product


async def make_unit(
    db: AsyncSession,
    name: str = "Гайвань «Белый фарфор»",
    *,
    category: Category | None = None,
    unit_price_kop: int = 150_000,
    stock: int = 5,
    status: ProductStatus = ProductStatus.PUBLISHED,
    **fields: Any,
) -> Product:
    product = Product(
        type="unit",
        name=name,
        slug=f"{slugify(name)}-{uuid.uuid4().hex[:4]}",
        category_id=category.id if category else None,
        status=status.value,
        unit_price_kop=unit_price_kop,
        stock=stock,
        weight_grams=fields.pop("weight_grams", 300),
        search_text=normalize_search(name),
        **fields,
    )
    db.add(product)
    await db.commit()
    return product


def jpeg_bytes(width: int = 1600, height: int = 1200, color: str = "#8E3236") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()
