import type { Schemas } from "@/lib/api/client";

export function customerRow(overrides: Partial<Schemas["CustomerRow"]> = {}): Schemas["CustomerRow"] {
  return {
    id: "c1",
    name: "Анна Смирнова",
    email: "anya@example.ru",
    phone: "+79001234567",
    telegram_username: "anya_tea",
    orders_count: 3,
    total_spent_kop: 1_260_000,
    points_balance: 120,
    last_order_at: "2026-10-05T09:00:00Z",
    created_at: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

export function customerCard(overrides: Partial<Schemas["CustomerCard"]> = {}): Schemas["CustomerCard"] {
  return {
    ...customerRow(),
    notes: null,
    marketing_consent: true,
    average_check_kop: 420_000,
    orders: [
      { id: "o1", number: "NSB-10001", status: "completed", status_label: "Выполнен", total_kop: 315_000, created_at: "2026-10-05T09:00:00Z" },
      { id: "o2", number: "NSB-10002", status: "shipped", status_label: "Передан в доставку", total_kop: 945_000, created_at: "2026-09-20T09:00:00Z" },
    ],
    points_history: [
      { id: "t2", delta: -30, kind_label: "Списано в заказе", comment: null, balance_after: 120, created_at: "2026-10-05T09:00:00Z" },
      { id: "t1", delta: 150, kind_label: "Изменено магазином", comment: "Подарок на день рождения", balance_after: 150, created_at: "2026-09-01T09:00:00Z" },
    ],
    ...overrides,
  };
}
