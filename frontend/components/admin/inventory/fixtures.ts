import type { Schemas } from "@/lib/api/client";

type StockRow = Schemas["StockRowOut"];

export function stockRow(overrides: Partial<StockRow> = {}): StockRow {
  return {
    product_id: "p1",
    name: "Да Хун Пао",
    type: "tea",
    status: "published",
    stock: 150,
    stock_label: "150 г",
    threshold: 50,
    threshold_label: "50 г",
    level: "ok",
    level_label: "В наличии",
    last_supply_at: "2026-10-05T09:00:00Z",
    image_url: null,
    ...overrides,
  };
}

/** весовой чай, всё хорошо */
export const daHunPao = stockRow();
/** весовой чай, осталось мало, поставок не было */
export const baiMuDan = stockRow({
  product_id: "p2",
  name: "Бай Му Дань",
  stock: 30,
  stock_label: "30 г",
  level: "low",
  level_label: "Осталось мало",
  last_supply_at: null,
});
/** штучный товар, закончился */
export const gaiwan = stockRow({
  product_id: "p3",
  name: "Гайвань",
  type: "unit",
  stock: 0,
  stock_label: "0 шт.",
  threshold: 2,
  threshold_label: "2 шт.",
  level: "out",
  level_label: "Нет в наличии",
  last_supply_at: "2026-09-01T09:00:00Z",
});

export const ALL_ROWS = [daHunPao, baiMuDan, gaiwan];

/** то же, что отдаёт поиск товаров для ProductPicker */
export function lookupOf(row: StockRow): Schemas["LookupProduct"] {
  return {
    id: row.product_id,
    slug: row.product_id,
    name: row.name,
    type: row.type,
    status: row.status,
    image_url: row.image_url,
    stock: row.stock,
    stock_label: row.stock_label,
  };
}

/** черновик: в таблице остатков его нет, остаток — только из поиска товаров */
export const draftOolong: Schemas["LookupProduct"] = {
  id: "p9",
  slug: "novyj-ulun",
  name: "Новый улун",
  type: "tea",
  status: "draft",
  image_url: null,
  stock: 40,
  stock_label: "40 г",
};

export function movement(overrides: Partial<Schemas["MovementOut"]> = {}): Schemas["MovementOut"] {
  return {
    id: "m1",
    product_id: "p1",
    product_name: "Да Хун Пао",
    reason: "supply",
    reason_label: "Поставка",
    delta: 500,
    delta_label: "+500 г",
    balance_after: 650,
    balance_label: "650 г",
    comment: "Поставщик Ли",
    order_id: null,
    order_number: null,
    supply_id: "s1",
    actor_name: "Никита",
    created_at: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

export const saleMovement = movement({
  id: "m2",
  reason: "sale",
  reason_label: "Продажа",
  delta: -50,
  delta_label: "−50 г",
  balance_after: 600,
  balance_label: "600 г",
  comment: null,
  order_id: "o1",
  order_number: "NSB-10001",
  supply_id: null,
  actor_name: "Система",
  created_at: "2026-10-06T10:00:00Z",
});

/** строки одной поставки — движения с её supply_id */
export const supplyLines = [
  movement(),
  movement({
    id: "m5",
    product_id: "p3",
    product_name: "Гайвань",
    delta: 4,
    delta_label: "+4 шт.",
    balance_after: 4,
    balance_label: "4 шт.",
  }),
];
