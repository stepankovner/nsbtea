import type { Schemas } from "@/lib/api/client";

export const daHunPao: Schemas["ProductBrief"] = { id: "p1", name: "Да Хун Пао", type: "tea", status: "published", image_url: null };
export const teGuanYin: Schemas["ProductBrief"] = { id: "p2", name: "Те Гуань Инь", type: "tea", status: "published", image_url: null };

/** Товары в выдаче поиска (ProductPicker). */
export const lookupTea = { id: "p1", slug: "da-hun-pao", name: "Да Хун Пао", type: "tea", status: "published", image_url: null, stock_label: "600 г" };
export const lookupOolong = { id: "p2", slug: "te-guan-yin", name: "Те Гуань Инь", type: "tea", status: "published", image_url: null, stock_label: "300 г" };

export function promotion(overrides: Partial<Schemas["PromotionOut"]> = {}): Schemas["PromotionOut"] {
  return {
    id: "pr1",
    title: "Осенние улуны",
    percent: 15,
    amount_kop: null,
    // 2 октября 00:00 — 31 октября 23:59 по Москве
    starts_at: "2026-10-01T21:00:00Z",
    ends_at: "2026-10-31T21:00:00Z",
    is_active: true,
    status_label: "Действует",
    products: [daHunPao],
    categories: [{ id: "cat1", name: "Улуны" }],
    stats: { uses: 12, discount_kop: 340_000 },
    ...overrides,
  };
}

export function promoCode(overrides: Partial<Schemas["PromoCodeOut"]> = {}): Schemas["PromoCodeOut"] {
  return {
    id: "pc1",
    code: "CHAI10",
    description: "Для подписчиков Telegram",
    percent: 10,
    amount_kop: null,
    min_order_kop: 200_000,
    max_uses: 100,
    max_uses_per_customer: 1,
    first_order_only: false,
    applies_to_discounted: false,
    starts_at: null,
    ends_at: null,
    is_active: true,
    status_label: "Действует",
    products: [],
    categories: [],
    stats: { uses: 5, discount_kop: 150_000 },
    ...overrides,
  };
}

const DAYS: [string, string][] = [
  ["2026-10-08", "8 октября"],
  ["2026-10-15", "15 октября"],
  ["2026-10-22", "22 октября"],
  ["2026-10-29", "29 октября"],
  ["2026-11-05", "5 ноября"],
  ["2026-11-12", "12 ноября"],
  ["2026-11-19", "19 ноября"],
  ["2026-11-26", "26 ноября"],
];

export function thursday(overrides: Partial<Schemas["ThursdayOut"]> = {}): Schemas["ThursdayOut"] {
  return { date: "2026-10-22", label: "22 октября", planned: false, percent: 20, custom_percent: null, note: null, products: [], ...overrides };
}

/** Календарь на 8 четвергов: «сегодня» — четверг 8 октября (общая скидка), 15-го — своя скидка 25%, дальше пусто. */
export function calendar(overrides: Partial<Schemas["ThursdayCalendarOut"]> = {}): Schemas["ThursdayCalendarOut"] {
  const upcoming = DAYS.map(([date, label]) => thursday({ date, label }));
  upcoming[0] = thursday({ date: "2026-10-08", label: "8 октября", planned: true, products: [daHunPao] });
  upcoming[1] = thursday({ date: "2026-10-15", label: "15 октября", planned: true, percent: 25, custom_percent: 25, note: "остатки весеннего урожая", products: [teGuanYin] });
  return { upcoming, default_percent: 20, mode: "week", ...overrides };
}

export function categoryTree(): Schemas["CategoryOut"][] {
  const base = {
    slug: "",
    sort_order: 0,
    description: null,
    seo_title: null,
    seo_description: null,
    is_visible: true,
    tile_color: "",
    cover: null,
    products_count: 3,
    archived_at: null,
    children: [],
  };
  return [
    {
      ...base,
      id: "root1",
      name: "Чай",
      slug: "chai",
      parent_id: null,
      children: [
        { ...base, id: "cat1", name: "Улуны", slug: "uluny", parent_id: "root1" },
        { ...base, id: "cat2", name: "Пуэры", slug: "puery", parent_id: "root1" },
      ],
    },
    { ...base, id: "root2", name: "Посуда", slug: "posuda", parent_id: null },
  ];
}

export const loyalty: Schemas["LoyaltySettings"] = {
  earn_percent: 5,
  max_spend_percent: 50,
  points_ttl_days: null,
  welcome_enabled: true,
  welcome_percent: 10,
};
