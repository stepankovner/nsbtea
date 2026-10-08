"""Начальное наполнение: блоки главной, служебные страницы, стартовые категории.

Идемпотентно: существующее не перезаписывается — запускать можно сколько угодно раз.
Тексты взяты из дизайна; владелец правит их в админке.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.inventory import MovementReason
from app.domain.slugs import slugify
from app.models import Category, HomeBlock, Page, Product
from app.models.content import HomeBlockKind, PageKind
from app.services import inventory
from app.services.catalog_admin import build_search_text


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


# ---------------------------------------------------------------- демо-каталог

DEMO_TEAS: list[dict[str, Any]] = [
    {
        "name": "Да Хун Пао",
        "category": "ulun",
        "hanzi": "大红袍",
        "pinyin": "dà hóng páo",
        "ppg": 2_800,
        "stock": 600,
        "short": "Глубокий прожаренный улун с утёсов Уишаня: орехи, какао, "
        "минеральное послевкусие.",
        "attrs": {
            "tea_type": "Улун",
            "region": "Уишань, Фуцзянь",
            "harvest_year": "2024",
            "shape": "loose",
            "effect": "energizing",
        },
        "brew": {"temp_c": 95, "grams": 6, "steeps": 7},
        "aliases": ["дахунпао", "большой красный халат"],
    },
    {
        "name": "Те Гуань Инь",
        "category": "ulun",
        "hanzi": "铁观音",
        "pinyin": "tiě guān yīn",
        "ppg": 1_800,
        "stock": 450,
        "short": "Свежий цветочный улун из Аньси — сирень, ландыш, сливочная сладость.",
        "attrs": {
            "tea_type": "Улун",
            "region": "Аньси, Фуцзянь",
            "harvest_year": "2025",
            "shape": "loose",
            "effect": "balanced",
        },
        "brew": {"temp_c": 90, "grams": 7, "steeps": 8},
        "aliases": ["тегуаньинь", "тгу"],
    },
    {
        "name": "Шу пуэр Менхай 7572",
        "category": "shu-puer",
        "hanzi": "熟普洱",
        "pinyin": "shú pǔ ěr",
        "ppg": 1_200,
        "stock": 2_000,
        "cake": 357,
        "short": "Классический рецепт фабрики Менхай: тёмный, плотный настой, "
        "нотки чернослива и дерева.",
        "attrs": {
            "tea_type": "Шу пуэр",
            "region": "Мэнхай, Юньнань",
            "pressing_year": "2019",
            "factory": "Menghai",
            "shape": "cake",
            "effect": "calming",
        },
        "brew": {"temp_c": 100, "grams": 7, "steeps": 10},
        "aliases": ["шу", "шуй", "шупуэр", "пуэр"],
    },
    {
        "name": "Шен пуэр Лао Бань Чжан",
        "category": "shen-puer",
        "hanzi": "老班章",
        "pinyin": "lǎo bān zhāng",
        "ppg": 6_500,
        "stock": 250,
        "cake": 200,
        "short": "Мощный шен с горы Булан: мёд, абрикос, долгая сладость после горчинки.",
        "attrs": {
            "tea_type": "Шен пуэр",
            "region": "Булан, Юньнань",
            "pressing_year": "2021",
            "shape": "cake",
            "effect": "energizing",
        },
        "brew": {"temp_c": 95, "grams": 6, "steeps": 12},
        "aliases": ["шен", "шэн", "лаобаньчжан"],
    },
    {
        "name": "Дянь Хун",
        "category": "krasnyi",
        "hanzi": "滇红",
        "pinyin": "diān hóng",
        "ppg": 1_400,
        "stock": 800,
        "short": "Юньнаньский красный чай с золотыми почками: мёд, хлебная корочка, сухофрукты.",
        "attrs": {
            "tea_type": "Красный",
            "region": "Фэнцин, Юньнань",
            "harvest_year": "2025",
            "shape": "loose",
            "effect": "balanced",
        },
        "brew": {"temp_c": 90, "grams": 5, "steeps": 6},
        "aliases": ["дяньхун", "красный"],
    },
    {
        "name": "Бай Му Дань",
        "category": "belyi",
        "hanzi": "白牡丹",
        "pinyin": "bái mǔ dān",
        "ppg": 1_600,
        "stock": 30,
        "short": "Белый пион из Фудина: луговые травы, дыня, лёгкая сладость.",
        "attrs": {
            "tea_type": "Белый",
            "region": "Фудин, Фуцзянь",
            "harvest_year": "2023",
            "shape": "loose",
            "effect": "calming",
        },
        "brew": {"temp_c": 85, "grams": 5, "steeps": 6},
        "aliases": ["баймудань", "белый пион"],
    },
    {
        "name": "Лун Цзин",
        "category": "zelenyi",
        "hanzi": "龙井",
        "pinyin": "lóng jǐng",
        "ppg": 2_200,
        "stock": 300,
        "short": "Колодец дракона из Ханчжоу: жареный каштан, свежая зелень, бархатный настой.",
        "attrs": {
            "tea_type": "Зелёный",
            "region": "Ханчжоу, Чжэцзян",
            "harvest_year": "2025",
            "shape": "loose",
            "effect": "energizing",
        },
        "brew": {"temp_c": 80, "grams": 4, "steeps": 4},
        "aliases": ["лунцзин", "колодец дракона"],
    },
    {
        "name": "Цзюнь Шань Инь Чжэнь",
        "category": "zheltyi",
        "hanzi": "君山银针",
        "pinyin": "jūn shān yín zhēn",
        "ppg": 4_200,
        "stock": 0,
        "short": "Редкий жёлтый чай с острова Цзюньшань: кукуруза, сливки, цветочный мёд.",
        "attrs": {
            "tea_type": "Жёлтый",
            "region": "Юэян, Хунань",
            "harvest_year": "2025",
            "shape": "loose",
            "effect": "balanced",
        },
        "brew": {"temp_c": 80, "grams": 4, "steeps": 5},
        "aliases": ["желтый"],
    },
    {
        "name": "ГАБА Алишань",
        "category": "gaba",
        "hanzi": "佳叶龙",
        "pinyin": "jiā yè lóng",
        "ppg": 3_000,
        "stock": 400,
        "short": "Тайваньская ГАБА: печёные яблоки, корица, мягкий расслабляющий эффект.",
        "attrs": {
            "tea_type": "ГАБА",
            "region": "Алишань, Тайвань",
            "harvest_year": "2024",
            "shape": "loose",
            "effect": "calming",
        },
        "brew": {"temp_c": 95, "grams": 6, "steeps": 7},
        "aliases": ["габа", "gaba"],
    },
]

DEMO_UNITS: list[dict[str, Any]] = [
    {
        "name": "Гайвань «Белый фарфор», 120 мл",
        "category": "posuda",
        "price": 150_000,
        "stock": 6,
        "weight": 300,
        "short": "Классическая гайвань из тонкого фарфора — для пролива любых чаёв.",
    },
    {
        "name": "Чахай из стекла, 200 мл",
        "category": "posuda",
        "price": 90_000,
        "stock": 2,
        "weight": 250,
        "short": "Сливник из жаропрочного стекла — видно цвет настоя.",
    },
    {
        "name": "Набор «Первое знакомство»",
        "category": "nabory",
        "price": 250_000,
        "stock": 5,
        "weight": 400,
        "short": "Пять чаёв по 25 г: улун, шу, шен, красный и белый — с картой заваривания.",
    },
]


async def seed_demo_catalog(db: AsyncSession, container: Container) -> int:
    """Демо-товары для тестового сервера. Повторный запуск ничего не дублирует."""
    categories = {c.slug: c for c in (await db.scalars(select(Category))).all()}
    existing = set((await db.scalars(select(Product.slug))).all())
    batch: list[tuple[Product, int]] = []

    for tea in DEMO_TEAS:
        batch.append(
            (
                Product(
                    type="tea",
                    name=tea["name"],
                    slug=slugify(tea["name"]),
                    status="published",
                    hanzi=tea["hanzi"],
                    pinyin=tea["pinyin"],
                    price_per_gram_kop=tea["ppg"],
                    weight_presets=[25, 50, 100],
                    cake_weight_grams=tea.get("cake"),
                    custom_weight_enabled=True,
                    short_description=tea["short"],
                    attributes=tea["attrs"],
                    brewing={
                        "methods": [{"method": "gongfu", "volume_ml": 100, **tea["brew"]}],
                        "master_note": None,
                    },
                    search_aliases=tea["aliases"],
                    category=categories.get(tea["category"]),
                ),
                tea["stock"],
            )
        )
    for unit in DEMO_UNITS:
        batch.append(
            (
                Product(
                    type="unit",
                    name=unit["name"],
                    slug=slugify(unit["name"]),
                    status="published",
                    unit_price_kop=unit["price"],
                    weight_grams=unit["weight"],
                    short_description=unit["short"],
                    attributes={},
                    brewing={},
                    search_aliases=[],
                    category=categories.get(unit["category"]),
                ),
                unit["stock"],
            )
        )

    created = 0
    for product, stock in batch:
        if product.slug in existing:
            continue
        product.stock = 0
        product.tags = []
        product.images = []
        product.search_text = build_search_text(product)
        db.add(product)
        await db.flush()
        if stock > 0:
            # остаток — только через журнал движения (правило 3)
            await inventory.change_stock(
                db, container, product.id, stock, MovementReason.SUPPLY, comment="Демо-данные"
            )
        created += 1
    return created
