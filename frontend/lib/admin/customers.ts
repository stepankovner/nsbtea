/** Раздел «Клиенты»: список, карточка, ручные баллы, заметки владельца (SPEC 10.6). */
import { formatPhone } from "@/lib/format";

import { adminApi, must, type Schemas } from "./client";

export type CustomerRow = Schemas["CustomerRow"];
export type CustomerCard = Schemas["CustomerCard"];
export type CustomersQuery = { q?: string; page?: number; per_page?: number };

export const customersApi = {
  list: (query: CustomersQuery) => must(adminApi.GET("/api/admin/customers", { params: { query } })),
  get: (id: string) => must(adminApi.GET("/api/admin/customers/{customer_id}", { params: { path: { customer_id: id } } })),
  updateNotes: (id: string, notes: string) =>
    must(adminApi.PATCH("/api/admin/customers/{customer_id}", { params: { path: { customer_id: id } }, body: { notes } })),
  /** delta > 0 — начислить, < 0 — списать; комментарий обязателен (его видит покупатель в истории). */
  adjustPoints: (id: string, body: Schemas["PointsAdjustIn"]) =>
    must(adminApi.POST("/api/admin/customers/{customer_id}/points", { params: { path: { customer_id: id } }, body })),
};

export const customerKeys = {
  all: ["customers"] as const,
  list: (query: CustomersQuery) => ["customers", "list", query] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
};

/** Как назвать клиента, если имени нет: почта, телефон, Telegram. */
export function customerName(c: Pick<CustomerRow, "name" | "email" | "phone" | "telegram_username">): string {
  return c.name?.trim() || c.email || formatPhone(c.phone) || (c.telegram_username ? `@${c.telegram_username}` : "") || "Без имени";
}
