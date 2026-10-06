"""Начальное наполнение: блоки главной, служебные страницы, стартовые категории.

Идемпотентно: существующее не перезаписывается — запускать можно сколько угодно раз.
Тексты взяты из дизайна; владелец правит их в админке.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, HomeBlock, Page
from app.models.content import HomeBlockKind, PageKind


def _doc(*paragraphs: str) -> dict[str, Any]:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]}
            for text in paragraphs
        ],
    }


HOME_BLOCKS: list[tuple[HomeBlockKind, dict[str, Any], bool]] = [
    (
        HomeBlockKind.HERO,
        {
            "kicker_left": "Интернет-магазин · Владимир",
            "kicker_right": "Чай · Церемонии · Сплавы",
            "title_line1": "Китайский чай",
            "title_line2": "во Владимире",
            "text": "Интернет-магазин Никиты Булича. Пуэры, улуны, красные, белые и зелёные чаи "
            "с доставкой по Владимиру и России. Чайные церемонии, выездные церемонии "
            "и сплавы на сапах.",
            "primary_label": "Выбрать чай",
            "primary_href": "/catalog",
            "secondary_label": "Записаться на церемонию",
            "secondary_href": "/events",
            "image_media_id": None,
            "image_caption": "фото: чайная церемония",
        },
        True,
    ),
    (
        HomeBlockKind.THURSDAY,
        {
            "title": "Три чая недели со скидкой",
            "note": "Каждый четверг Никита выбирает три чая. Скидка держится всю неделю — "
            "до следующего четверга. Потом будут новые три.",
        },
        True,
    ),
    (
        HomeBlockKind.SERVICES,
        {
            "title": "Не только чай",
            "items": [
                {
                    "kicker": "Во Владимире",
                    "chip_color": "ink",
                    "title": "Чайные церемонии",
                    "text": "Вечерние встречи: несколько чаёв одной темы, посуда, "
                    "неспешный разговор.",
                    "cta_label": "Расписание",
                    "cta_href": "/events?type=ceremony",
                    "image_media_id": None,
                },
                {
                    "kicker": "На воде",
                    "chip_color": "green",
                    "title": "Сплавы на сапах",
                    "text": "Несколько часов по Клязьме и чайная церемония на берегу.",
                    "cta_label": "Даты сплавов",
                    "cta_href": "/events?type=rafting",
                    "image_media_id": None,
                },
                {
                    "kicker": "На выезде",
                    "chip_color": "red",
                    "title": "Церемония на заказ",
                    "text": "Привезём чай, посуду и мастера на праздник, в офис или на природу.",
                    "cta_label": "Оставить заявку",
                    "cta_href": "/ceremonies",
                    "image_media_id": None,
                },
            ],
        },
        True,
    ),
    (HomeBlockKind.FEATURED, {"title": "Сейчас в наличии", "product_ids": [], "limit": 4}, True),
    (HomeBlockKind.NEW_PRODUCTS, {"title": "Новинки", "limit": 4}, False),
    (HomeBlockKind.SETS, {"title": "Наборы", "category_slug": "nabory", "limit": 4}, False),
    (
        HomeBlockKind.EVENTS,
        {"kicker": "Расписание", "title": "Ближайшие церемонии и сплавы", "limit": 3},
        True,
    ),
    (
        HomeBlockKind.ABOUT,
        {
            "kicker": "О магазине",
            "title": "НСБ — инициалы основателя, Никиты Сергеевича Булича.",
            "text": "Пока НСБ работает как интернет-магазин: заказ на сайте, доставка "
            "по Владимиру и по России. Про любой чай можно спросить в Telegram — расскажем, "
            "откуда он и как его заваривать.",
            "image_media_id": None,
            "image_caption": "фото: Никита за чайным столом",
        },
        True,
    ),
    (
        HomeBlockKind.ADVANTAGES,
        {
            "title": "Почему у нас",
            "items": [
                {"title": "Любая граммовка", "text": "25, 50, 100 г, целый блин или свой вес."},
                {
                    "title": "Баллы за покупки",
                    "text": "5% возвращаются баллами на следующий заказ.",
                },
                {"title": "Как заварить", "text": "У каждого чая — параметры заваривания."},
            ],
        },
        False,
    ),
    (
        HomeBlockKind.WHOLESALE,
        {
            "title": "Оптовые заказы",
            "text": "Чай для кафе, ресторанов, магазинов и корпоративных подарков. "
            "Пришлём оптовый прайс и поможем собрать ассортимент.",
        },
        True,
    ),
]

PAGES: list[tuple[str, str, PageKind, bool, list[str]]] = [
    (
        "about",
        "О магазине",
        PageKind.PAGE,
        True,
        [
            "НСБ — инициалы основателя, Никиты Сергеевича Булича.",
            "Расскажите здесь о магазине и о чайном мастере. Текст меняется в админке: "
            "«Ещё → Страницы».",
        ],
    ),
    (
        "delivery",
        "Доставка и оплата",
        PageKind.PAGE,
        True,
        [
            "Доставляем по Владимиру курьером и по всей России через СДЭК — до пункта выдачи "
            "или до двери. Стоимость СДЭК считается при оформлении заказа.",
            "Оплата — онлайн картой или через СБП на защищённой странице банка «Точка». "
            "Чек приходит на почту.",
        ],
    ),
    ("contacts", "Контакты", PageKind.PAGE, True, ["Владимир. Пишите нам в Telegram."]),
    (
        "wholesale",
        "Опт для заведений",
        PageKind.PAGE,
        True,
        [
            "Чай для кафе, ресторанов, магазинов и корпоративных подарков. Пришлём оптовый "
            "прайс и поможем собрать ассортимент."
        ],
    ),
    (
        "ceremonies",
        "Индивидуальные церемонии",
        PageKind.PAGE,
        True,
        [
            "Привезём чай, посуду и мастера: домой, в офис, на праздник или на природу. "
            "Расскажите, где и когда, — перезвоним, предложим чаи и рассчитаем стоимость."
        ],
    ),
    (
        "offer",
        "Публичная оферта",
        PageKind.LEGAL,
        False,
        ["Текст оферты готовит владелец магазина. Вставьте его в админке и опубликуйте."],
    ),
    (
        "privacy",
        "Политика обработки персональных данных",
        PageKind.LEGAL,
        False,
        ["Текст политики готовит владелец магазина. Вставьте его в админке и опубликуйте."],
    ),
    (
        "consent",
        "Согласие на обработку персональных данных",
        PageKind.LEGAL,
        False,
        ["Текст согласия готовит владелец магазина. Вставьте его в админке и опубликуйте."],
    ),
    (
        "gongfu",
        "Пролив (гунфу ча)",
        PageKind.GUIDE,
        True,
        [
            "Небольшой чайник или гайвань, много листа и короткие проливы. "
            "Подходит для пуэров и улунов: вкус раскрывается по шагам."
        ],
    ),
    (
        "european",
        "Европейский способ",
        PageKind.GUIDE,
        True,
        ["Заварочный чайник, 3–5 г на 300 мл, 3–5 минут. Просто и без особой посуды."],
    ),
    (
        "thermos",
        "Чай в термосе",
        PageKind.GUIDE,
        True,
        ["Шу пуэр, красные чаи и выдержанные белые хорошо держат вкус в термосе."],
    ),
    (
        "cold-brew",
        "Холодное заваривание",
        PageKind.GUIDE,
        True,
        ["Зелёные и белые чаи на ночь в холодильнике: мягко, сладко и без горечи."],
    ),
]

LEGAL_SLUGS = ("offer", "privacy", "consent")

CATEGORIES: list[tuple[str, str, str]] = [
    ("Шу пуэр", "shu-puer", "puer"),
    ("Шен пуэр", "shen-puer", "puer"),
    ("Красный", "krasnyi", "red"),
    ("Улун", "ulun", "oolong"),
    ("Белый", "belyi", "white"),
    ("Жёлтый", "zheltyi", "yellow"),
    ("Зелёный", "zelenyi", "green"),
    ("ГАБА", "gaba", "oolong"),
    ("Посуда", "posuda", "neutral"),
    ("Наборы", "nabory", "neutral"),
]


async def seed_content(db: AsyncSession) -> None:
    existing_blocks = set((await db.scalars(select(HomeBlock.kind))).all())
    for order, (kind, data, visible) in enumerate(HOME_BLOCKS):
        if kind.value not in existing_blocks:
            db.add(HomeBlock(kind=kind.value, data=data, sort_order=order, is_visible=visible))

    existing_pages = set((await db.scalars(select(Page.slug))).all())
    for order, (slug, title, page_kind, published, paragraphs) in enumerate(PAGES):
        if slug not in existing_pages:
            db.add(
                Page(
                    slug=slug,
                    title=title,
                    kind=page_kind.value,
                    content=_doc(*paragraphs),
                    is_published=published,
                    sort_order=order,
                )
            )
    await db.flush()


async def seed_categories(db: AsyncSession) -> None:
    if await db.scalar(select(Category.id).limit(1)):
        return
    for order, (name, slug, color) in enumerate(CATEGORIES):
        db.add(Category(name=name, slug=slug, tile_color=color, sort_order=order))
    await db.flush()
