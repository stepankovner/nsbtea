import type { Tone } from "@/components/admin/page";
import { TIME_ZONE } from "@/lib/format";

import { adminApi, must, type Schemas } from "./client";
import { NAV } from "./nav";

export type Staff = Schemas["StaffOut"];
export type PermissionOption = Schemas["PermissionOption"];

export const staffApi = {
  list: () => must(adminApi.GET("/api/admin/staff")),
  create: (body: Schemas["StaffCreateIn"]) => must(adminApi.POST("/api/admin/staff", { body })),
  /** Меняем только переданное: без expires_at срок остаётся прежним, restore — вернуть отозванный доступ. */
  update: (id: string, body: Partial<Schemas["StaffUpdateIn"]>) =>
    must(
      adminApi.PATCH("/api/admin/staff/{staff_id}", {
        params: { path: { staff_id: id } },
        body: body as Schemas["StaffUpdateIn"],
      }),
    ),
  revoke: (id: string) => must(adminApi.POST("/api/admin/staff/{staff_id}/revoke", { params: { path: { staff_id: id } } })),
  /** Новая ссылка-приглашение; старая перестаёт работать. */
  renewInvite: (id: string) => must(adminApi.POST("/api/admin/staff/{staff_id}/invite", { params: { path: { staff_id: id } } })),
};

export const staffKeys = {
  all: ["staff"] as const,
  list: ["staff", "list"] as const,
};

/** По умолчанию сотруднику — заказы и склад (SPEC 10.9). */
export const DEFAULT_PERMISSIONS = ["orders", "inventory"];

/** Сколько дней по умолчанию длится временный доступ. */
export const DEFAULT_ACCESS_DAYS = 30;

/** Ссылка-приглашение действует 7 дней (backend: INVITE_TTL). */
export const INVITE_DAYS = 7;

/** Подпись раздела — как в меню админки; если в меню такого нет — как присылает сервер. */
export function permissionLabel(value: string, options: PermissionOption[] = []): string {
  return NAV.find((n) => n.permission === value)?.label ?? options.find((o) => o.value === value)?.label ?? value;
}

/** Разделы в порядке меню/сервера, через запятую. */
export function permissionsText(values: string[], options: PermissionOption[]): string {
  const order = options.map((o) => o.value);
  return [...values]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map((v) => permissionLabel(v, options))
    .join(", ");
}

export type StaffStatus = "revoked" | "expired" | "invited" | "active";

export const STAFF_STATUS: Record<StaffStatus, { label: string; tone: Tone }> = {
  active: { label: "Активен", tone: "success" },
  invited: { label: "Приглашён", tone: "info" },
  expired: { label: "Доступ истёк", tone: "warning" },
  revoked: { label: "Доступ отозван", tone: "neutral" },
};

export function staffStatus(s: Staff, now: Date = new Date()): StaffStatus {
  if (s.revoked_at) return "revoked";
  if (s.expires_at && new Date(s.expires_at).getTime() <= now.getTime()) return "expired";
  if (s.invite_pending) return "invited";
  return "active";
}

// ------------------------------------------------------------------ даты доступа (по Москве)

/** «2026-10-08» — сегодняшняя дата по Москве (для поля даты). */
export function moscowDateInput(value: string | Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  // en-CA даёт ровно ГГГГ-ММ-ДД
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Дата из поля + N дней. */
export function addDays(dateInput: string, days: number): string {
  const [y, m, d] = dateInput.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Доступ «до 31 декабря» — включительно, до конца дня по Москве.
 * В Москве с 2014 года круглый год UTC+3, без перехода на летнее время.
 */
export function endOfMoscowDay(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59+03:00`).toISOString();
}
