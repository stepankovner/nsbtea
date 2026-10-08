/**
 * Склад (SPEC 3.3, 10.4): остатки, «нужно дозаказать», поставки, инвентаризация, списания, история.
 * Вес — только целые граммы, штуки — целые (CLAUDE.md, правило 2). Отрицательный остаток проверяет сервер.
 */
import { formatQty } from "@/lib/format";

import { adminApi, must, type Schemas } from "./client";

export type StockRow = Schemas["StockRowOut"];
export type Movement = Schemas["MovementOut"];
export type SupplyListItem = Schemas["SupplyListItem"];
export type WriteoffReason = Schemas["WriteoffIn"]["reason"];

export type StockQuery = { q?: string; level?: Schemas["StockLevel"] };
export type MovementsQuery = { product_id?: string; page?: number; per_page?: number };
export type SuppliesQuery = { page?: number; per_page?: number };

export const inventoryApi = {
  stock: (query: StockQuery) => must(adminApi.GET("/api/admin/inventory", { params: { query } })),
  reorder: () => must(adminApi.GET("/api/admin/inventory/reorder")),
  supplies: (query: SuppliesQuery) => must(adminApi.GET("/api/admin/inventory/supplies", { params: { query } })),
  postSupply: (body: Schemas["SupplyIn"]) => must(adminApi.POST("/api/admin/inventory/supplies", { body })),
  count: (body: Schemas["CountIn"]) => must(adminApi.POST("/api/admin/inventory/count", { body })),
  writeOff: (body: Schemas["WriteoffIn"]) => must(adminApi.POST("/api/admin/inventory/writeoffs", { body })),
  movements: (query: MovementsQuery) => must(adminApi.GET("/api/admin/inventory/movements", { params: { query } })),
};

export const inventoryKeys = {
  all: ["inventory"] as const,
  stock: (query: StockQuery) => ["inventory", "stock", query] as const,
  reorder: ["inventory", "reorder"] as const,
  supplies: (query: SuppliesQuery) => ["inventory", "supplies", query] as const,
  movements: (query: MovementsQuery) => ["inventory", "movements", query] as const,
  /** товары, которых нет в таблице остатков (черновики), — из поиска товаров */
  lookup: (ids: string[]) => ["inventory", "lookup", ids] as const,
};

export type InventoryTab = "stock" | "reorder" | "supplies" | "history";

export const INVENTORY_TABS: { value: InventoryTab; label: string }[] = [
  { value: "stock", label: "Остатки" },
  { value: "reorder", label: "Нужно дозаказать" },
  { value: "supplies", label: "Поставки" },
  { value: "history", label: "История" },
];

/** Причины списания — те же, что принимает сервер. */
export const WRITEOFF_REASONS: { value: WriteoffReason; label: string; example: string }[] = [
  { value: "defect", label: "Брак", example: "испортился, отсырел, порвалась упаковка" },
  { value: "tasting", label: "Дегустация", example: "заварили на пробу для гостей или на церемонии" },
  { value: "personal", label: "Личное", example: "взяли себе или в подарок" },
  { value: "other", label: "Другое", example: "напишите в комментарии, что случилось" },
];

/** Ограничения сервера: одна поставка — не больше 1 000 000, фактический остаток — не больше 10 000 000. */
export const MAX_SUPPLY = 1_000_000;
export const MAX_ACTUAL = 10_000_000;

export type QtyRule = "supply" | "count" | "writeoff";
export type QtyCheck = { value: number; error: null } | { value: null; error: string };

const EMPTY: Record<QtyRule, string> = {
  supply: "Укажите, сколько пришло",
  count: "Укажите, сколько есть на самом деле",
  writeoff: "Укажите, сколько списать",
};

export function isTea(type: string): boolean {
  return type === "tea";
}

export function unitLabel(type: string): string {
  return isTea(type) ? "г" : "шт.";
}

function fail(error: string): QtyCheck {
  return { value: null, error };
}

/**
 * Проверка числа из поля ввода: только целые граммы (чай) или целые штуки.
 * `current` — остаток на складе, нужен для списания.
 */
export function checkQty(text: string, type: string, rule: QtyRule, current?: number): QtyCheck {
  const tea = isTea(type);
  const cleaned = text.replace(/[\s  ]/g, "");
  if (!cleaned) return fail(EMPTY[rule]);
  if (/^-/.test(cleaned)) return fail(`Введите число без минуса, например ${tea ? "500" : "3"}`);
  if (/^\d*[.,]\d*$/.test(cleaned) && /\d/.test(cleaned)) {
    return fail(tea ? "Только целые граммы, без дробей. Например, 250" : "Только целое число штук, например 3");
  }
  if (!/^\d+$/.test(cleaned)) {
    return fail(tea ? "Введите граммы цифрами, например 500 (1 кг = 1000 г)" : "Введите число штук цифрами, например 3");
  }
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value > MAX_ACTUAL) return fail("Слишком большое число — проверьте");
  if (rule !== "count" && value === 0) return fail("Должно быть больше нуля");
  if (rule === "supply" && value > MAX_SUPPLY) {
    return fail(`Слишком много для одной поставки (${formatQty(type, value)}) — проверьте число`);
  }
  if (rule === "writeoff" && current !== undefined && value > current) {
    return fail(`Нельзя списать ${formatQty(type, value)}: на складе ${formatQty(type, current)}`);
  }
  return { value, error: null };
}

/** «+500 г», «−30 г», «без изменений» — как подписи сервера. */
export function signedQty(type: string, delta: number): string {
  if (delta === 0) return "без изменений";
  return `${delta > 0 ? "+" : "−"}${formatQty(type, Math.abs(delta))}`;
}

/** `?products=id1,id2` → ["id1", "id2"] без пустых и повторов. */
export function parseIds(param: string | null): string[] {
  if (!param) return [];
  const ids = param
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/** Число из подписи остатка («1 200 г» → 1200) — для товаров, которых нет в таблице остатков. */
export function qtyFromLabel(label: string): number | null {
  const digits = label.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}
