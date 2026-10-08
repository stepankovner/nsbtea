import { adminApi, must, type Schemas } from "./client";

export type NotificationsData = Schemas["NotificationsOut"];
export type Recipient = Schemas["RecipientOut"];

export const notificationsApi = {
  list: () => must(adminApi.GET("/api/admin/notifications")),
  update: (id: string, patch: Schemas["RecipientPatch"]) =>
    must(adminApi.PATCH("/api/admin/notifications/{recipient_id}", { params: { path: { recipient_id: id } }, body: patch })),
  remove: (id: string) => must(adminApi.DELETE("/api/admin/notifications/{recipient_id}", { params: { path: { recipient_id: id } } })),
  /** Одноразовый код и ссылка на бота: кто откроет её в Telegram, станет получателем. Действует 30 минут. */
  link: () => must(adminApi.POST("/api/admin/notifications/link")),
};

export const notificationKeys = {
  all: ["notifications"] as const,
};

/** Когда приходит уведомление — дополнение к названию события с сервера (SPEC 11.1). */
export const EVENT_DETAILS: Record<string, string> = {
  new_order: "Сразу: номер, сумма, состав с граммовками, доставка и ссылка на заказ.",
  low_stock: "Один раз, когда остаток опустился до порога «Осталось мало».",
  out_of_stock: "Сразу, как только товар закончился.",
  new_application: "Сразу: опт, событие или чайная церемония.",
  order_attention: "Сразу, если с заказом что-то пошло не так — например, оплата пришла после отмены.",
  thursday_reminder: "По понедельникам в 10:00, если на ближайший четверг не выбран чай недели.",
  weekly_summary: "По понедельникам в 10:00: выручка, заказы, топ товаров, баллы и что дозаказать.",
};
