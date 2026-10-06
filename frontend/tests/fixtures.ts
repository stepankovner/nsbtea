/** Тестовые данные в форме ответов API (типы — из OpenAPI). */
import type { Schemas } from "@/lib/api/client";

export function productCard(overrides: Partial<Schemas["ProductCard"]> = {}): Schemas["ProductCard"] {
  return {
    id: "0192f000-0000-7000-8000-000000000001",
    slug: "da-hun-pao",
    name: "Да Хун Пао",
    type: "tea",
    hanzi: "大红袍",
    pinyin: "dà hóng páo",
    tile_color: "oolong",
    image: null,
    meta: "Улун · Уишань · 2024",
    short_description: "Глубокий прожаренный улун с минеральным послевкусием.",
    price_kop: 140_000,
    old_price_kop: null,
    price_grams: 50,
    price_per_gram_kop: 2_800,
    in_stock: true,
    badges: [],
    default_variant: { kind: "preset", grams: 50 },
    brewing_summary: { temp: "95°", grams: "6 г", steeps: "7", steeps_label: "проливов" },
    ...overrides,
  };
}

export function productPage(overrides: Partial<Schemas["ProductPage"]> = {}): Schemas["ProductPage"] {
  return {
    ...productCard(),
    description: null,
    images: [],
    attributes: [{ key: "region", label: "Регион", value: "Уишань" }],
    flavor_tags: [{ slug: "orehi", name: "орехи", count: 1 }],
    brewing: null,
    weight_options: [
      { kind: "preset", grams: 25, label: "25 г", price_kop: 70_000, old_price_kop: null, available: true },
      { kind: "preset", grams: 50, label: "50 г", price_kop: 140_000, old_price_kop: null, available: true },
      { kind: "preset", grams: 100, label: "100 г", price_kop: 280_000, old_price_kop: null, available: true },
      { kind: "preset", grams: 200, label: "200 г", price_kop: 560_000, old_price_kop: null, available: false },
    ],
    custom_weight: { enabled: true, min: 10, step: 5, max: 120 },
    max_qty: 0,
    available_grams: 120,
    low_stock: false,
    upcoming_thursday: null,
    promotion_title: null,
    category: null,
    breadcrumbs: [],
    similar: [],
    goes_with: [],
    set_contains: [],
    seo: { title: "Да Хун Пао", description: "", canonical: "https://nsbtea.test/product/da-hun-pao", og_image: null },
    updated_at: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

export function cartLine(overrides: Partial<Schemas["CartLineOut"]> = {}): Schemas["CartLineOut"] {
  return {
    id: "0192f000-0000-7000-8000-0000000000a1",
    product_id: "0192f000-0000-7000-8000-000000000001",
    slug: "da-hun-pao",
    name: "Да Хун Пао",
    type: "tea",
    image_url: null,
    hanzi: "大红袍",
    tile_color: "oolong",
    variant_kind: "preset",
    grams: 50,
    qty: 2,
    variant_label: "50 г",
    unit_price_kop: 140_000,
    line_total_kop: 280_000,
    product_discount_kop: 0,
    order_discount_kop: 0,
    total_kop: 280_000,
    promotion_label: null,
    problem: null,
    max_qty: 2,
    ...overrides,
  };
}

export function cart(overrides: Partial<Schemas["CartOut"]> = {}): Schemas["CartOut"] {
  return {
    lines: [cartLine()],
    count: 1,
    items_total_kop: 280_000,
    product_discount_kop: 0,
    order_discount_kop: 0,
    order_discount_label: null,
    items_after_discounts_kop: 280_000,
    promo_code: null,
    welcome: null,
    points: { enabled: false, balance: 0, max_spend: 0, requested: 0, applied: 0 },
    points_to_earn: 140,
    total_without_delivery_kop: 280_000,
    notes: [],
    problems: [],
    weight_grams: 150,
    ...overrides,
  };
}

export function site(overrides: Partial<Schemas["SiteOut"]> = {}): Schemas["SiteOut"] {
  return {
    store: {
      shop_name: "НСБ Чай",
      legal_name: "ИП Булич Никита Сергеевич",
      inn: "330000000000",
      ogrnip: "300000000000000",
      legal_address: "г. Владимир",
      phone: "+7 900 000-00-00",
      email: "shop@nsbtea.ru",
      address: "Владимир",
      telegram_url: "https://t.me/nsbtea",
      telegram_channel_url: "",
      vk_url: "",
      work_hours: "",
    },
    metrika_id: "",
    yandex_verification: "",
    seo_home_title: "НСБ Чай",
    seo_home_description: "",
    welcome: { enabled: true, percent: 10 },
    thursday: { percent: 20, mode: "week", active: true, ends_on_label: "8 октября" },
    delivery: {
      pickup_enabled: true,
      pickup_address: "Владимир, ул. Примерная, 1",
      courier_enabled: true,
      courier_price_kop: 0,
      courier_free_from_kop: null,
      courier_note: "Привезём сами в удобное время",
      cdek_enabled: true,
      cdek_free_from_kop: null,
      origin_city_code: 94,
    },
    allow_pay_on_delivery: false,
    pages: [
      { slug: "offer", title: "Публичная оферта", kind: "legal" },
      { slug: "privacy", title: "Политика обработки персональных данных", kind: "legal" },
    ],
    telegram_bot_username: null,
    yandex_maps_api_key: null,
    ...overrides,
  };
}
