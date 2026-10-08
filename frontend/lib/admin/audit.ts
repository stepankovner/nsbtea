import { adminApi, must, type Schemas } from "./client";

export type AuditEntry = Schemas["AuditEntry"];
export type AuditQuery = { entity?: string; actor_id?: string; page?: number; per_page?: number };

export const auditApi = {
  list: (query: AuditQuery) => must(adminApi.GET("/api/admin/audit", { params: { query } })),
};

export const auditKeys = {
  all: ["audit"] as const,
  list: (filters: Omit<AuditQuery, "page" | "per_page">) => ["audit", "list", filters] as const,
};

/** Что менялось — коротко, для отметки у записи. */
export const ENTITY_LABELS: Record<string, string> = {
  order: "Заказ",
  product: "Товар",
  category: "Категория",
  supply: "Поставка",
  inventory: "Склад",
  customer: "Клиент",
  promotion: "Акция",
  promo_code: "Промокод",
  thursday: "Чай недели",
  page: "Страница",
  home_block: "Главная",
  event: "Событие",
  application: "Заявка",
  settings: "Настройки",
  admin_user: "Доступы и вход",
};

/** Фильтр «Что менялось» — разделы журнала (значения — как `entity` на сервере). */
export const ENTITY_FILTERS: { value: string; label: string }[] = [
  { value: "order", label: "Заказы" },
  { value: "product", label: "Товары" },
  { value: "category", label: "Категории" },
  { value: "supply", label: "Склад: поставки" },
  { value: "inventory", label: "Склад: инвентаризация и списания" },
  { value: "customer", label: "Клиенты и баллы" },
  { value: "promotion", label: "Акции" },
  { value: "promo_code", label: "Промокоды" },
  { value: "thursday", label: "Чай недели" },
  { value: "page", label: "Страницы" },
  { value: "home_block", label: "Главная страница" },
  { value: "event", label: "События" },
  { value: "application", label: "Заявки" },
  { value: "settings", label: "Настройки" },
  { value: "admin_user", label: "Сотрудники и входы" },
];
