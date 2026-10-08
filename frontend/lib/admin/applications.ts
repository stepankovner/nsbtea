/** Заявки с сайта: опт, запись на событие, индивидуальная церемония (SPEC 9, 10.8). */
import type { Tone } from "@/components/admin/page";
import { formatPhone } from "@/lib/format";

import { adminApi, must, type Schemas } from "./client";

export type Application = Schemas["ApplicationOut"];
export type ApplicationStatus = Schemas["ApplicationStatus"];
export type ApplicationsQuery = {
  status?: string;
  type?: string;
  page?: number;
  per_page?: number;
};

export const applicationsApi = {
  list: (query: ApplicationsQuery) =>
    must(adminApi.GET("/api/admin/applications", { params: { query } })),
  get: (id: string) =>
    must(
      adminApi.GET("/api/admin/applications/{application_id}", {
        params: { path: { application_id: id } },
      }),
    ),
  patch: (id: string, body: Schemas["ApplicationPatch"]) =>
    must(
      adminApi.PATCH("/api/admin/applications/{application_id}", {
        params: { path: { application_id: id } },
        body,
      }),
    ),
};

export const applicationKeys = {
  all: ["applications"] as const,
  list: (query: ApplicationsQuery) => ["applications", "list", query] as const,
  detail: (id: string) => ["applications", "detail", id] as const,
};

/** Статусы по SPEC 10.8; «Отменена» — только для отменённой записи на событие (освобождает места). */
export const APPLICATION_STATUSES: {
  value: ApplicationStatus;
  label: string;
  tab: string;
  hint: string;
}[] = [
  { value: "new", label: "Новая", tab: "Новые", hint: "Ещё никто не связался" },
  { value: "in_progress", label: "В работе", tab: "В работе", hint: "Связались, обсуждаем" },
  { value: "closed", label: "Закрыта", tab: "Закрытые", hint: "Договорились или вопрос решён" },
];

export const APPLICATION_STATUS_TONES: Record<string, Tone> = {
  new: "brand",
  in_progress: "warning",
  closed: "success",
  cancelled: "neutral",
};

export const APPLICATION_TYPES: { value: string; label: string }[] = [
  { value: "wholesale", label: "Опт" },
  { value: "event", label: "Запись на событие" },
  { value: "private_ceremony", label: "Индивидуальная церемония" },
];

/** Подписи полей формы заявки (как в уведомлении в Telegram, content_public.DATA_LABELS). */
const DATA_LABELS: [key: string, label: string][] = [
  ["organization", "Организация"],
  ["city", "Город"],
  ["volume", "Объём в месяц"],
  ["date", "Желаемая дата"],
  ["occasion", "Повод и место"],
  ["place", "Где"],
  ["guests", "Гостей"],
  ["comment", "Комментарий"],
];
/** Эти поля показываем в контактах, а не в «что хочет». */
const CONTACT_KEYS = new Set(["email"]);

export interface Detail {
  key: string;
  label: string;
  value: string;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** «Что хочет»: поля формы с понятными подписями, пустые пропускаем. */
export function applicationDetails(app: Application): Detail[] {
  const data: Record<string, unknown> = { ...app.data };
  if (app.type === "event") data.guests = app.guests;
  const known = new Set(DATA_LABELS.map(([k]) => k));
  const out: Detail[] = [];
  for (const [key, label] of DATA_LABELS) {
    const value = text(data[key]);
    if (value) out.push({ key, label, value });
  }
  for (const [key, raw] of Object.entries(data)) {
    if (known.has(key) || CONTACT_KEYS.has(key)) continue;
    const value = text(raw);
    if (value) out.push({ key, label: key, value });
  }
  return out;
}

export interface ContactLink {
  kind: "phone" | "telegram" | "email";
  label: string;
  href: string;
}

export function contactLinks(app: Application): ContactLink[] {
  const out: ContactLink[] = [];
  if (app.phone)
    out.push({ kind: "phone", label: formatPhone(app.phone), href: `tel:${app.phone}` });
  if (app.telegram)
    out.push({ kind: "telegram", label: `@${app.telegram}`, href: `https://t.me/${app.telegram}` });
  const email = text(app.data.email);
  if (email) out.push({ kind: "email", label: email, href: `mailto:${email}` });
  return out;
}

/** Короткое «о чём заявка» для строки списка. */
export function applicationSubject(app: Application): string {
  if (app.type === "event") return app.event_title ?? "";
  const d = app.data;
  return [text(d.organization), text(d.city), text(d.date), text(d.occasion)]
    .filter(Boolean)
    .join(" · ");
}
