/** Тестовые данные раздела «Сотрудники» в форме ответов API. */
import type { Schemas } from "@/lib/api/client";

type Staff = Schemas["StaffOut"];

export const PERMISSIONS: Schemas["PermissionOption"][] = [
  { value: "orders", label: "Заказы" },
  { value: "products", label: "Товары" },
  { value: "inventory", label: "Склад" },
  { value: "customers", label: "Клиенты" },
  { value: "promotions", label: "Акции и промокоды" },
  { value: "content", label: "Страницы, главная и события" },
  { value: "applications", label: "Заявки" },
];

export function staff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: "s1",
    name: "Аня",
    email: "anya@example.com",
    role: "staff",
    permissions: ["inventory", "orders"],
    telegram_linked: false,
    expires_at: "2099-12-31T20:59:59Z",
    is_owner: false,
    revoked_at: null,
    invite_pending: false,
    last_login_at: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

export const OWNER: Staff = staff({
  id: "u1",
  name: "Никита",
  email: "owner@nsbtea.ru",
  role: "owner",
  permissions: [],
  is_owner: true,
  expires_at: null,
  telegram_linked: true,
});

export function staffList(items: Staff[] = [staff()]): Schemas["StaffListOut"] {
  return { items: [OWNER, ...items], permissions: PERMISSIONS };
}
