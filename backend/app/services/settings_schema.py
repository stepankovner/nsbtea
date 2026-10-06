"""Настройки, которые владелец меняет в админке. Значения по умолчанию — из ТЗ.

У каждого поля — понятное название и подсказка: админка строит формы по этим описаниям.
"""

from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.orders import DeliveryMethod
from app.domain.thursday import ThursdayMode


class SettingsGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: ClassVar[str]
    title: ClassVar[str]


class CatalogSettings(SettingsGroup):
    key: ClassVar[str] = "catalog"
    title: ClassVar[str] = "Каталог и остатки"

    weight_presets: list[int] = Field(
        default=[25, 50, 100, 200],
        title="Варианты веса чая, г",
        description="Из этого списка у каждого чая отмечаются нужные варианты. "
        "Например: 25, 50, 100.",
    )
    low_stock_tea_grams: int = Field(
        default=50,
        ge=0,
        le=100_000,
        title="«Осталось мало» для чая, г",
        description="Когда чая останется столько граммов или меньше — на сайте появится "
        "плашка «Осталось мало», а вам придёт сообщение в Telegram.",
    )
    low_stock_units: int = Field(
        default=2,
        ge=0,
        le=10_000,
        title="«Осталось мало» для посуды и наборов, шт.",
        description="То же для штучных товаров.",
    )
    new_badge_days: int = Field(
        default=30,
        ge=0,
        le=365,
        title="Сколько дней показывать плашку «Новинка»",
        description="Отсчёт — с первой публикации товара.",
    )
    out_of_stock_last: bool = Field(
        default=True,
        title="Товары без остатка — в конец списка",
        description="Закончившиеся товары остаются видны с плашкой «Нет в наличии», "
        "но показываются после остальных.",
    )

    @field_validator("weight_presets")
    @classmethod
    def _presets(cls, value: list[int]) -> list[int]:
        cleaned = sorted(set(value))
        if not cleaned:
            raise ValueError("Добавьте хотя бы один вариант веса")
        if any(v <= 0 or v > 5_000 for v in cleaned):
            raise ValueError("Вес варианта — от 1 до 5000 г")
        return cleaned


class LoyaltySettings(SettingsGroup):
    key: ClassVar[str] = "loyalty"
    title: ClassVar[str] = "Баллы и приветственная скидка"

    earn_percent: int = Field(
        default=5,
        ge=0,
        le=100,
        title="Начислять баллов, % от суммы",
        description="1 балл = 1 ₽. Считается от суммы, оплаченной деньгами за товары "
        "(без доставки). Начисляются, когда заказ выполнен.",
    )
    max_spend_percent: int = Field(
        default=50,
        ge=0,
        le=100,
        title="Оплатить баллами можно до, % заказа",
        description="Доля стоимости товаров после всех скидок, которую можно оплатить баллами.",
    )
    points_ttl_days: int | None = Field(
        default=None,
        ge=1,
        le=3650,
        title="Срок жизни баллов, дней",
        description="Пусто — баллы не сгорают.",
    )
    welcome_enabled: bool = Field(
        default=True,
        title="Приветственная скидка включена",
        description="Скидка на первый оплаченный заказ нового покупателя.",
    )
    welcome_percent: int = Field(
        default=10, ge=1, le=99, title="Приветственная скидка, %", description="Например, 10."
    )


class ThursdaySettings(SettingsGroup):
    key: ClassVar[str] = "thursday"
    title: ClassVar[str] = "Чай недели (акция четверга)"

    percent: int = Field(
        default=20,
        ge=1,
        le=99,
        title="Скидка, %",
        description="Общая скидка. У конкретного четверга можно задать свою.",
    )
    mode: ThursdayMode = Field(
        default=ThursdayMode.WEEK,
        title="Сколько действует скидка",
        description="«Неделю» — с четверга до следующего четверга; «День» — только в четверг "
        "с 00:00 до 23:59 по Москве.",
    )


class Box(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=60)
    max_weight_grams: int = Field(ge=1, le=100_000)
    length_cm: int = Field(ge=1, le=300)
    width_cm: int = Field(ge=1, le=300)
    height_cm: int = Field(ge=1, le=300)


DEFAULT_BOXES = [
    Box(
        code="s", name="Маленькая", max_weight_grams=1_000, length_cm=20, width_cm=15, height_cm=10
    ),
    Box(code="m", name="Средняя", max_weight_grams=3_000, length_cm=30, width_cm=20, height_cm=15),
    Box(code="l", name="Большая", max_weight_grams=10_000, length_cm=40, width_cm=30, height_cm=30),
]


class DeliverySettings(SettingsGroup):
    key: ClassVar[str] = "delivery"
    title: ClassVar[str] = "Доставка"

    origin_city_code: int = Field(
        default=94,
        title="Город отправки (код СДЭК)",
        description="94 — Владимир. Менять не нужно, если отправляете из Владимира.",
    )
    origin_city_name: str = Field(default="Владимир", title="Город отправки")
    packaging_grams: int = Field(
        default=50,
        ge=0,
        le=5_000,
        title="Вес упаковки заказа, г",
        description="Добавляется к весу товаров при расчёте СДЭК.",
    )
    boxes: list[Box] = Field(
        default_factory=lambda: list(DEFAULT_BOXES),
        title="Коробки",
        description="Для расчёта СДЭК берётся самая маленькая коробка, в которую помещается вес.",
    )
    cdek_enabled: bool = Field(default=True, title="СДЭК включён")
    cdek_pvz_tariff: int = Field(
        default=136, title="Тариф СДЭК до пункта выдачи", description="136 — «Посылка склад-склад»."
    )
    cdek_door_tariff: int = Field(
        default=137, title="Тариф СДЭК до двери", description="137 — «Посылка склад-дверь»."
    )
    cdek_free_from_kop: int | None = Field(
        default=None,
        ge=0,
        title="Бесплатная доставка СДЭК от, коп.",
        description="Пусто — всегда платно.",
    )
    courier_enabled: bool = Field(default=True, title="Курьер по Владимиру включён")
    courier_price_kop: int = Field(
        default=0, ge=0, title="Стоимость курьера, коп.", description="0 — бесплатно."
    )
    courier_free_from_kop: int | None = Field(
        default=None, ge=0, title="Курьер бесплатно от, коп.", description="Пусто — без порога."
    )
    courier_note: str = Field(
        default="Привезём сами в удобное время. Только по Владимиру.",
        max_length=300,
        title="Подпись к курьерской доставке",
    )
    pickup_enabled: bool = Field(default=True, title="Самовывоз включён")
    pickup_address: str = Field(
        default="Владимир — адрес пришлём после заказа",
        max_length=300,
        title="Адрес самовывоза",
    )
    auto_complete_days: int = Field(
        default=14,
        ge=1,
        le=90,
        title="Автозавершение заказа через, дней",
        description="Если заказ передан в доставку и вы не отметили «Выполнен», он завершится "
        "сам через столько дней, и клиенту начислятся баллы.",
    )

    def enabled_methods(self) -> list[DeliveryMethod]:
        methods: list[DeliveryMethod] = []
        if self.cdek_enabled:
            methods += [DeliveryMethod.CDEK_PVZ, DeliveryMethod.CDEK_DOOR]
        if self.courier_enabled:
            methods.append(DeliveryMethod.COURIER)
        if self.pickup_enabled:
            methods.append(DeliveryMethod.PICKUP)
        return methods

    @model_validator(mode="after")
    def _boxes(self) -> "DeliverySettings":
        if not self.boxes:
            raise ValueError("Добавьте хотя бы одну коробку")
        return self


TAX_SYSTEMS = {
    "osn": "ОСН — общая",
    "usn_income": "УСН «Доходы»",
    "usn_income_outcome": "УСН «Доходы минус расходы»",
    "esn": "ЕСХН",
    "patent": "Патент",
}
VAT_TYPES = {
    "none": "Без НДС",
    "vat0": "НДС 0%",
    "vat5": "НДС 5%",
    "vat7": "НДС 7%",
    "vat10": "НДС 10%",
    "vat22": "НДС 22%",
}


class PaymentSettings(SettingsGroup):
    key: ClassVar[str] = "payment"
    title: ClassVar[str] = "Оплата и чеки"

    tax_system: str = Field(
        default="usn_income",
        title="Система налогообложения",
        description="Уточните у бухгалтера — попадает в каждый чек.",
    )
    vat_type: str = Field(
        default="none",
        title="Ставка НДС в чеке",
        description="Уточните у бухгалтера. Для УСН обычно «Без НДС».",
    )
    allow_pay_on_delivery: bool = Field(
        default=False,
        title="Разрешить оплату при получении",
        description="Только для самовывоза и курьера по Владимиру. Внимание: при оплате "
        "при получении чек по 54-ФЗ нужно пробить самостоятельно (нужна касса).",
    )

    @field_validator("tax_system")
    @classmethod
    def _tax(cls, value: str) -> str:
        if value not in TAX_SYSTEMS:
            raise ValueError("Выберите систему налогообложения из списка")
        return value

    @field_validator("vat_type")
    @classmethod
    def _vat(cls, value: str) -> str:
        if value not in VAT_TYPES:
            raise ValueError("Выберите ставку НДС из списка")
        return value


class StoreSettings(SettingsGroup):
    key: ClassVar[str] = "store"
    title: ClassVar[str] = "Магазин, реквизиты и контакты"

    shop_name: str = Field(default="НСБ Чай", max_length=80, title="Название магазина")
    legal_name: str = Field(
        default="",
        max_length=200,
        title="Название ИП",
        description="Как в документах, например: ИП Булич Никита Сергеевич.",
    )
    inn: str = Field(default="", max_length=12, title="ИНН")
    ogrnip: str = Field(default="", max_length=15, title="ОГРНИП")
    legal_address: str = Field(default="", max_length=300, title="Юридический адрес")
    phone: str = Field(default="", max_length=40, title="Телефон магазина")
    email: str = Field(default="", max_length=200, title="Почта магазина")
    address: str = Field(default="Владимир", max_length=300, title="Адрес (для подвала сайта)")
    telegram_url: str = Field(default="", max_length=200, title="Ссылка на Telegram")
    telegram_channel_url: str = Field(default="", max_length=200, title="Ссылка на канал")
    vk_url: str = Field(default="", max_length=200, title="Ссылка на ВКонтакте")
    work_hours: str = Field(default="", max_length=200, title="Часы работы")


class SeoSettings(SettingsGroup):
    key: ClassVar[str] = "seo"
    title: ClassVar[str] = "Поисковики и аналитика"

    home_title: str = Field(
        default="НСБ Чай — китайский чай во Владимире с доставкой по России",
        max_length=200,
        title="Заголовок главной для поисковиков",
    )
    home_description: str = Field(
        default="Пуэры, улуны, красные, белые и зелёные чаи. Чайные церемонии и сплавы "
        "во Владимире. Доставка по России.",
        max_length=400,
        title="Описание главной для поисковиков",
    )
    metrika_id: str = Field(
        default="",
        max_length=20,
        title="Номер счётчика Яндекс Метрики",
        description="Только цифры, например 12345678.",
    )
    yandex_verification: str = Field(
        default="", max_length=100, title="Код подтверждения Яндекс Вебмастера"
    )

    @field_validator("metrika_id")
    @classmethod
    def _metrika(cls, value: str) -> str:
        value = value.strip()
        if value and not value.isdigit():
            raise ValueError("Номер счётчика — только цифры")
        return value


ALL_GROUPS: tuple[type[SettingsGroup], ...] = (
    StoreSettings,
    CatalogSettings,
    LoyaltySettings,
    ThursdaySettings,
    DeliverySettings,
    PaymentSettings,
    SeoSettings,
)
GROUPS_BY_KEY: dict[str, type[SettingsGroup]] = {g.key: g for g in ALL_GROUPS}
