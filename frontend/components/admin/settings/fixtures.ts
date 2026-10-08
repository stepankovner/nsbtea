/** Тестовые данные настроек — копия ответа backend (`GET /admin/settings/meta` и значения по умолчанию). */
import type { AllSettings, SettingsMeta } from "@/lib/admin/settings";

const META: SettingsMeta = {
  groups: {
    store: {
      title: "Магазин, реквизиты и контакты",
      schema: {
        properties: {
          shop_name: {
            default: "НСБ Чай",
            maxLength: 80,
            title: "Название магазина",
            type: "string",
          },
          legal_name: {
            default: "",
            description: "Как в документах, например: ИП Булич Никита Сергеевич.",
            maxLength: 200,
            title: "Название ИП",
            type: "string",
          },
          inn: {
            default: "",
            maxLength: 12,
            title: "ИНН",
            type: "string",
          },
          ogrnip: {
            default: "",
            maxLength: 15,
            title: "ОГРНИП",
            type: "string",
          },
          legal_address: {
            default: "",
            maxLength: 300,
            title: "Юридический адрес",
            type: "string",
          },
          phone: {
            default: "",
            maxLength: 40,
            title: "Телефон магазина",
            type: "string",
          },
          email: {
            default: "",
            maxLength: 200,
            title: "Почта магазина",
            type: "string",
          },
          address: {
            default: "Владимир",
            maxLength: 300,
            title: "Адрес (для подвала сайта)",
            type: "string",
          },
          telegram_url: {
            default: "",
            maxLength: 200,
            title: "Ссылка на Telegram",
            type: "string",
          },
          telegram_channel_url: {
            default: "",
            maxLength: 200,
            title: "Ссылка на канал",
            type: "string",
          },
          vk_url: {
            default: "",
            maxLength: 200,
            title: "Ссылка на ВКонтакте",
            type: "string",
          },
          work_hours: {
            default: "",
            maxLength: 200,
            title: "Часы работы",
            type: "string",
          },
        },
        title: "StoreSettings",
        type: "object",
      },
    },
    catalog: {
      title: "Каталог и остатки",
      schema: {
        properties: {
          weight_presets: {
            default: [25, 50, 100, 200],
            description:
              "Из этого списка у каждого чая отмечаются нужные варианты. Например: 25, 50, 100.",
            items: {
              type: "integer",
            },
            title: "Варианты веса чая, г",
            type: "array",
          },
          low_stock_tea_grams: {
            default: 50,
            description:
              "Когда чая останется столько граммов или меньше — на сайте появится плашка «Осталось мало», а вам придёт сообщение в Telegram.",
            maximum: 100000,
            minimum: 0,
            title: "«Осталось мало» для чая, г",
            type: "integer",
          },
          low_stock_units: {
            default: 2,
            description: "То же для штучных товаров.",
            maximum: 10000,
            minimum: 0,
            title: "«Осталось мало» для посуды и наборов, шт.",
            type: "integer",
          },
          new_badge_days: {
            default: 30,
            description: "Отсчёт — с первой публикации товара.",
            maximum: 365,
            minimum: 0,
            title: "Сколько дней показывать плашку «Новинка»",
            type: "integer",
          },
          out_of_stock_last: {
            default: true,
            description:
              "Закончившиеся товары остаются видны с плашкой «Нет в наличии», но показываются после остальных.",
            title: "Товары без остатка — в конец списка",
            type: "boolean",
          },
        },
        title: "CatalogSettings",
        type: "object",
      },
    },
    loyalty: {
      title: "Баллы и приветственная скидка",
      schema: {
        properties: {
          earn_percent: {
            default: 5,
            description:
              "1 балл = 1 ₽. Считается от суммы, оплаченной деньгами за товары (без доставки). Начисляются, когда заказ выполнен.",
            maximum: 100,
            minimum: 0,
            title: "Начислять баллов, % от суммы",
            type: "integer",
          },
          max_spend_percent: {
            default: 50,
            description:
              "Доля стоимости товаров после всех скидок, которую можно оплатить баллами.",
            maximum: 100,
            minimum: 0,
            title: "Оплатить баллами можно до, % заказа",
            type: "integer",
          },
          points_ttl_days: {
            anyOf: [
              {
                maximum: 3650,
                minimum: 1,
                type: "integer",
              },
              {
                type: "null",
              },
            ],
            default: null,
            description: "Пусто — баллы не сгорают.",
            title: "Срок жизни баллов, дней",
          },
          welcome_enabled: {
            default: true,
            description: "Скидка на первый оплаченный заказ нового покупателя.",
            title: "Приветственная скидка включена",
            type: "boolean",
          },
          welcome_percent: {
            default: 10,
            description: "Например, 10.",
            maximum: 99,
            minimum: 1,
            title: "Приветственная скидка, %",
            type: "integer",
          },
        },
        title: "LoyaltySettings",
        type: "object",
      },
    },
    thursday: {
      title: "Чай недели (акция четверга)",
      schema: {
        $defs: {
          ThursdayMode: {
            enum: ["day", "week"],
            title: "ThursdayMode",
            type: "string",
          },
        },
        properties: {
          percent: {
            default: 20,
            description: "Общая скидка. У конкретного четверга можно задать свою.",
            maximum: 99,
            minimum: 1,
            title: "Скидка, %",
            type: "integer",
          },
          mode: {
            $ref: "#/$defs/ThursdayMode",
            default: "week",
            description:
              "«Неделю» — с четверга до следующего четверга; «День» — только в четверг с 00:00 до 23:59 по Москве.",
            title: "Сколько действует скидка",
          },
        },
        title: "ThursdaySettings",
        type: "object",
      },
    },
    delivery: {
      title: "Доставка",
      schema: {
        $defs: {
          Box: {
            properties: {
              code: {
                maxLength: 16,
                minLength: 1,
                title: "Code",
                type: "string",
              },
              name: {
                maxLength: 60,
                minLength: 1,
                title: "Name",
                type: "string",
              },
              max_weight_grams: {
                maximum: 100000,
                minimum: 1,
                title: "Max Weight Grams",
                type: "integer",
              },
              length_cm: {
                maximum: 300,
                minimum: 1,
                title: "Length Cm",
                type: "integer",
              },
              width_cm: {
                maximum: 300,
                minimum: 1,
                title: "Width Cm",
                type: "integer",
              },
              height_cm: {
                maximum: 300,
                minimum: 1,
                title: "Height Cm",
                type: "integer",
              },
            },
            required: ["code", "name", "max_weight_grams", "length_cm", "width_cm", "height_cm"],
            title: "Box",
            type: "object",
          },
        },
        properties: {
          origin_city_code: {
            default: 94,
            description: "94 — Владимир. Менять не нужно, если отправляете из Владимира.",
            title: "Город отправки (код СДЭК)",
            type: "integer",
          },
          origin_city_name: {
            default: "Владимир",
            title: "Город отправки",
            type: "string",
          },
          packaging_grams: {
            default: 50,
            description: "Добавляется к весу товаров при расчёте СДЭК.",
            maximum: 5000,
            minimum: 0,
            title: "Вес упаковки заказа, г",
            type: "integer",
          },
          boxes: {
            description:
              "Для расчёта СДЭК берётся самая маленькая коробка, в которую помещается вес.",
            items: {
              $ref: "#/$defs/Box",
            },
            title: "Коробки",
            type: "array",
          },
          cdek_enabled: {
            default: true,
            title: "СДЭК включён",
            type: "boolean",
          },
          cdek_pvz_tariff: {
            default: 136,
            description: "136 — «Посылка склад-склад».",
            title: "Тариф СДЭК до пункта выдачи",
            type: "integer",
          },
          cdek_door_tariff: {
            default: 137,
            description: "137 — «Посылка склад-дверь».",
            title: "Тариф СДЭК до двери",
            type: "integer",
          },
          cdek_free_from_kop: {
            anyOf: [
              {
                minimum: 0,
                type: "integer",
              },
              {
                type: "null",
              },
            ],
            default: null,
            description: "Пусто — всегда платно.",
            title: "Бесплатная доставка СДЭК от, коп.",
          },
          courier_enabled: {
            default: true,
            title: "Курьер по Владимиру включён",
            type: "boolean",
          },
          courier_price_kop: {
            default: 0,
            description: "0 — бесплатно.",
            minimum: 0,
            title: "Стоимость курьера, коп.",
            type: "integer",
          },
          courier_free_from_kop: {
            anyOf: [
              {
                minimum: 0,
                type: "integer",
              },
              {
                type: "null",
              },
            ],
            default: null,
            description: "Пусто — без порога.",
            title: "Курьер бесплатно от, коп.",
          },
          courier_note: {
            default: "Привезём сами в удобное время. Только по Владимиру.",
            maxLength: 300,
            title: "Подпись к курьерской доставке",
            type: "string",
          },
          pickup_enabled: {
            default: true,
            title: "Самовывоз включён",
            type: "boolean",
          },
          pickup_address: {
            default: "Владимир — адрес пришлём после заказа",
            maxLength: 300,
            title: "Адрес самовывоза",
            type: "string",
          },
          auto_complete_days: {
            default: 14,
            description:
              "Если заказ передан в доставку и вы не отметили «Выполнен», он завершится сам через столько дней, и клиенту начислятся баллы.",
            maximum: 90,
            minimum: 1,
            title: "Автозавершение заказа через, дней",
            type: "integer",
          },
        },
        title: "DeliverySettings",
        type: "object",
      },
    },
    payment: {
      title: "Оплата и чеки",
      schema: {
        properties: {
          tax_system: {
            default: "usn_income",
            description: "Уточните у бухгалтера — попадает в каждый чек.",
            title: "Система налогообложения",
            type: "string",
          },
          vat_type: {
            default: "none",
            description: "Уточните у бухгалтера. Для УСН обычно «Без НДС».",
            title: "Ставка НДС в чеке",
            type: "string",
          },
          allow_pay_on_delivery: {
            default: false,
            description:
              "Только для самовывоза и курьера по Владимиру. Внимание: при оплате при получении чек по 54-ФЗ нужно пробить самостоятельно (нужна касса).",
            title: "Разрешить оплату при получении",
            type: "boolean",
          },
        },
        title: "PaymentSettings",
        type: "object",
      },
    },
    seo: {
      title: "Поисковики и аналитика",
      schema: {
        properties: {
          home_title: {
            default: "НСБ Чай — китайский чай во Владимире с доставкой по России",
            maxLength: 200,
            title: "Заголовок главной для поисковиков",
            type: "string",
          },
          home_description: {
            default:
              "Пуэры, улуны, красные, белые и зелёные чаи. Чайные церемонии и сплавы во Владимире. Доставка по России.",
            maxLength: 400,
            title: "Описание главной для поисковиков",
            type: "string",
          },
          metrika_id: {
            default: "",
            description: "Только цифры, например 12345678.",
            maxLength: 20,
            title: "Номер счётчика Яндекс Метрики",
            type: "string",
          },
          yandex_verification: {
            default: "",
            maxLength: 100,
            title: "Код подтверждения Яндекс Вебмастера",
            type: "string",
          },
        },
        title: "SeoSettings",
        type: "object",
      },
    },
  },
  tax_systems: {
    osn: "ОСН — общая",
    usn_income: "УСН «Доходы»",
    usn_income_outcome: "УСН «Доходы минус расходы»",
    esn: "ЕСХН",
    patent: "Патент",
  },
  vat_types: {
    none: "Без НДС",
    vat0: "НДС 0%",
    vat5: "НДС 5%",
    vat7: "НДС 7%",
    vat10: "НДС 10%",
    vat22: "НДС 22%",
  },
};

const VALUES: AllSettings = {
  store: {
    shop_name: "НСБ Чай",
    legal_name: "",
    inn: "",
    ogrnip: "",
    legal_address: "",
    phone: "",
    email: "",
    address: "Владимир",
    telegram_url: "",
    telegram_channel_url: "",
    vk_url: "",
    work_hours: "",
  },
  catalog: {
    weight_presets: [25, 50, 100, 200],
    low_stock_tea_grams: 50,
    low_stock_units: 2,
    new_badge_days: 30,
    out_of_stock_last: true,
  },
  loyalty: {
    earn_percent: 5,
    max_spend_percent: 50,
    points_ttl_days: null,
    welcome_enabled: true,
    welcome_percent: 10,
  },
  thursday: {
    percent: 20,
    mode: "week",
  },
  delivery: {
    origin_city_code: 94,
    origin_city_name: "Владимир",
    packaging_grams: 50,
    boxes: [
      {
        code: "s",
        name: "Маленькая",
        max_weight_grams: 1000,
        length_cm: 20,
        width_cm: 15,
        height_cm: 10,
      },
      {
        code: "m",
        name: "Средняя",
        max_weight_grams: 3000,
        length_cm: 30,
        width_cm: 20,
        height_cm: 15,
      },
      {
        code: "l",
        name: "Большая",
        max_weight_grams: 10000,
        length_cm: 40,
        width_cm: 30,
        height_cm: 30,
      },
    ],
    cdek_enabled: true,
    cdek_pvz_tariff: 136,
    cdek_door_tariff: 137,
    cdek_free_from_kop: null,
    courier_enabled: true,
    courier_price_kop: 0,
    courier_free_from_kop: null,
    courier_note: "Привезём сами в удобное время. Только по Владимиру.",
    pickup_enabled: true,
    pickup_address: "Владимир — адрес пришлём после заказа",
    auto_complete_days: 14,
  },
  payment: {
    tax_system: "usn_income",
    vat_type: "none",
    allow_pay_on_delivery: false,
  },
  seo: {
    home_title: "НСБ Чай — китайский чай во Владимире с доставкой по России",
    home_description:
      "Пуэры, улуны, красные, белые и зелёные чаи. Чайные церемонии и сплавы во Владимире. Доставка по России.",
    metrika_id: "",
    yandex_verification: "",
  },
};

export function settingsMeta(): SettingsMeta {
  return structuredClone(META);
}

export function allSettings(
  overrides: { [K in keyof AllSettings]?: Partial<AllSettings[K]> } = {},
): AllSettings {
  const base = structuredClone(VALUES);
  for (const key of Object.keys(overrides) as (keyof AllSettings)[]) {
    Object.assign(base[key], overrides[key]);
  }
  return base;
}
