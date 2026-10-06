import { adminApi, must, type Schemas } from "./client";

export type AdminOrder = Schemas["AdminOrderOut"];
export type OrdersQuery = {
  status?: string;
  delivery?: string;
  q?: string;
  page?: number;
  per_page?: number;
};

export const ordersApi = {
  list: (query: OrdersQuery) => must(adminApi.GET("/api/admin/orders", { params: { query } })),
  get: (id: string) => must(adminApi.GET("/api/admin/orders/{order_id}", { params: { path: { order_id: id } } })),
  setStatus: (id: string, body: { to: string; tracking_number?: string; comment?: string }) =>
    must(
      adminApi.POST("/api/admin/orders/{order_id}/status", {
        params: { path: { order_id: id } },
        body: body as Schemas["StatusIn"],
      }),
    ),
  patch: (id: string, body: Schemas["OrderPatch"]) =>
    must(adminApi.PATCH("/api/admin/orders/{order_id}", { params: { path: { order_id: id } }, body })),
  cancel: (id: string, body: Schemas["CancelIn"]) =>
    must(adminApi.POST("/api/admin/orders/{order_id}/cancel", { params: { path: { order_id: id } }, body })),
  refund: (id: string, body: Partial<Schemas["RefundIn"]>) =>
    must(
      adminApi.POST("/api/admin/orders/{order_id}/refund", {
        params: { path: { order_id: id } },
        body: body as Schemas["RefundIn"],
      }),
    ),
};

export const orderKeys = {
  all: ["orders"] as const,
  list: (query: OrdersQuery) => ["orders", "list", query] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
};

/** Вкладки списка: короткие понятные названия и порядок по частоте работы. */
export const ORDER_TABS: { value: string | null; label: string }[] = [
  { value: null, label: "Все" },
  { value: "paid", label: "Новые" },
  { value: "needs_attention", label: "Требуют внимания" },
  { value: "assembling", label: "Собираются" },
  { value: "shipped", label: "Отправлены" },
  { value: "accepted", label: "Оплата при получении" },
  { value: "awaiting_payment", label: "Ждут оплаты" },
  { value: "completed", label: "Выполнены" },
  { value: "cancelled", label: "Отменены" },
  { value: "refunded", label: "Возвраты" },
];
