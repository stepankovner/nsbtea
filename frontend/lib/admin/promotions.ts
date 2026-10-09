/**
 * Раздел «Акции»: акции на товары, промокоды, приветственная скидка, «чай недели» (SPEC 7.2, 10.7).
 *
 * Даты на сервере — UTC (ISO с «Z»), владелец видит и вводит московское время (правило 5).
 */
import type { Tone } from "@/components/admin/page";
import { formatDateTime, formatRub, plural, TIME_ZONE } from "@/lib/format";

import { adminApi, must, type Schemas } from "./client";

export type Promotion = Schemas["PromotionOut"];
export type PromotionBody = Schemas["PromotionIn"];
export type PromoCode = Schemas["PromoCodeOut"];
export type PromoCodeBody = Schemas["PromoCodeSaveIn"];
export type UsageStats = Schemas["UsageStats"];
export type Thursday = Schemas["ThursdayOut"];
export type ThursdayCalendar = Schemas["ThursdayCalendarOut"];
export type ThursdayBody = Schemas["ThursdayIn"];
export type AdminCategory = Schemas["CategoryOut"];
export type LoyaltySettings = Schemas["LoyaltySettings"];

export const promotionsApi = {
  list: () => must(adminApi.GET("/api/admin/promotions")),
  listArchived: () => must(adminApi.GET("/api/admin/promotions", { params: { query: { archived: true } } })),
  /** вернуть из архива — акция возвращается выключенной */
  restore: (id: string) =>
    must(adminApi.POST("/api/admin/promotions/{promotion_id}/restore", { params: { path: { promotion_id: id } } })),
  create: (body: PromotionBody) => must(adminApi.POST("/api/admin/promotions", { body })),
  update: (id: string, body: Schemas["PromotionPatch"]) =>
    must(adminApi.PATCH("/api/admin/promotions/{promotion_id}", { params: { path: { promotion_id: id } }, body })),
  archive: (id: string) => must(adminApi.DELETE("/api/admin/promotions/{promotion_id}", { params: { path: { promotion_id: id } } })),
  welcomeStats: () => must(adminApi.GET("/api/admin/promotions/welcome-stats")),

  codes: () => must(adminApi.GET("/api/admin/promo-codes")),
  codesArchived: () => must(adminApi.GET("/api/admin/promo-codes", { params: { query: { archived: true } } })),
  /** вернуть из архива — промокод возвращается выключенным */
  restoreCode: (id: string) => must(adminApi.POST("/api/admin/promo-codes/{code_id}/restore", { params: { path: { code_id: id } } })),
  createCode: (body: PromoCodeBody) => must(adminApi.POST("/api/admin/promo-codes", { body })),
  updateCode: (id: string, body: Schemas["PromoCodePatch"]) =>
    must(adminApi.PATCH("/api/admin/promo-codes/{code_id}", { params: { path: { code_id: id } }, body })),
  archiveCode: (id: string) => must(adminApi.DELETE("/api/admin/promo-codes/{code_id}", { params: { path: { code_id: id } } })),

  thursdays: () => must(adminApi.GET("/api/admin/thursdays")),
  saveThursday: (day: string, body: ThursdayBody) => must(adminApi.PUT("/api/admin/thursdays/{day}", { params: { path: { day } }, body })),
  clearThursday: (day: string) => must(adminApi.DELETE("/api/admin/thursdays/{day}", { params: { path: { day } } })),

  /** Дерево категорий — доступно с правом «Акции» или «Товары». */
  categories: () => must(adminApi.GET("/api/admin/categories")),
  /** Текущие настройки баллов и приветственной скидки — только владельцу. */
  loyaltySettings: async (): Promise<LoyaltySettings> => (await must(adminApi.GET("/api/admin/settings"))).loyalty,
};

export const promotionKeys = {
  all: ["promotions"] as const,
  list: ["promotions", "list"] as const,
  archived: ["promotions", "archived"] as const,
  codes: ["promotions", "codes"] as const,
  codesArchived: ["promotions", "codes-archived"] as const,
  welcome: ["promotions", "welcome"] as const,
  thursdays: ["promotions", "thursdays"] as const,
  categories: ["promotions", "categories"] as const,
  loyalty: ["promotions", "loyalty-settings"] as const,
};

// ------------------------------------------------------------------ время по Москве

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function moscowParts(date: Date): Parts {
  const parts = partsFormat.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

function partsToFields(p: Parts): { date: string; time: string } {
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

function parseDate(date: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function parseTime(time: string): [number, number] {
  const m = /^(\d{2}):(\d{2})/.exec(time);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

/** Дата и время по Москве из полей формы → момент в UTC для сервера. Без даты — `null`. */
export function moscowToIso(date: string, time: string): string | null {
  const d = parseDate(date);
  if (!d) return null;
  const [hour, minute] = parseTime(time);
  const wall = Date.UTC(d[0], d[1] - 1, d[2], hour, minute);
  // смещение Москвы от UTC в этот момент (сейчас +3, но не зашиваем его в код)
  const p = moscowParts(new Date(wall));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall;
  return new Date(wall - offset).toISOString();
}

/** Момент с сервера → поля формы по Москве. */
export function isoToMoscow(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  return partsToFields(moscowParts(new Date(iso)));
}

const END_OF_DAY = "23:59";

/**
 * Окончание акции. «23:59» (или пустое время) — до конца этого дня включительно,
 * поэтому на сервер уходит полночь следующего дня: скидка действует всю последнюю минуту.
 */
export function endToIso(date: string, time: string): string | null {
  const d = parseDate(date);
  if (!d) return null;
  if (!time || time.startsWith(END_OF_DAY)) {
    const next = new Date(Date.UTC(d[0], d[1] - 1, d[2] + 1));
    return moscowToIso(next.toISOString().slice(0, 10), "00:00");
  }
  return moscowToIso(date, time);
}

/** Окончание с сервера → поля: полночь по Москве показываем как «23:59 предыдущего дня». */
export function isoToEnd(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const at = new Date(iso);
  const p = moscowParts(at);
  if (p.hour === 0 && p.minute === 0) return partsToFields(moscowParts(new Date(at.getTime() - 60_000)));
  return partsToFields(p);
}

function endText(iso: string): string {
  const at = new Date(iso);
  const p = moscowParts(at);
  return formatDateTime(p.hour === 0 && p.minute === 0 ? new Date(at.getTime() - 60_000) : at);
}

/** «10 октября 2026, 00:00 — 20 октября 2026, 23:59», «с …», «до …», «Без срока». */
export function periodText(starts: string | null, ends: string | null): string {
  if (starts && ends) return `${formatDateTime(starts)} — ${endText(ends)}`;
  if (starts) return `с ${formatDateTime(starts)}`;
  if (ends) return `до ${endText(ends)}`;
  return "Без срока";
}

/** Сегодняшняя дата по Москве, «YYYY-MM-DD». */
export function moscowToday(now: Date = new Date()): string {
  return partsToFields(moscowParts(now)).date;
}

// ------------------------------------------------------------------ подписи

export function discountText(percent: number | null, amountKop: number | null): string {
  if (percent !== null) return `−${percent}%`;
  return `−${formatRub(amountKop ?? 0)}`;
}

/** «12 раз, скидка 3 400 ₽» — сколько раз применили и на какую сумму. */
export function usageText(stats: UsageStats): string {
  if (!stats.uses) return "Пока не применяли";
  return `${stats.uses} ${plural(stats.uses, "раз", "раза", "раз")}, скидка ${formatRub(stats.discount_kop)}`;
}

export interface StatusView {
  label: string;
  tone: Tone;
}

const ARCHIVED: StatusView = { label: "В архиве", tone: "neutral" };

/** Статус акции считает сервер; здесь — понятное слово и цвет. */
export function promotionStatus(promotion: Pick<Promotion, "status_label" | "archived">): StatusView {
  // в архиве акция ещё и выключена — показываем главное
  if (promotion.archived) return ARCHIVED;
  switch (promotion.status_label) {
    case "Действует":
      return { label: "Идёт", tone: "success" };
    case "Запланирована":
      return { label: "Запланирована", tone: "info" };
    case "Закончилась":
      return { label: "Закончилась", tone: "neutral" };
    case "Выключена":
      return { label: "Выключена", tone: "warning" };
    default:
      return { label: promotion.status_label, tone: "neutral" };
  }
}

/** Порядок в списке: сначала идущие, потом будущие, выключенные, закончившиеся. */
export const PROMOTION_ORDER: Record<string, number> = { Действует: 0, Запланирована: 1, Выключена: 2, Закончилась: 3 };

/**
 * Статус промокода для владельца. Подпись сервера обращена к покупателю
 * («Срок действия промокода закончился»), поэтому считаем коротко по тем же правилам.
 */
export function promoCodeStatus(code: PromoCode, now: Date = new Date()): StatusView {
  if (code.archived) return ARCHIVED;
  if (!code.is_active) return { label: "Выключен", tone: "warning" };
  if (code.starts_at && new Date(code.starts_at) > now) return { label: "Запланирован", tone: "info" };
  if (code.ends_at && new Date(code.ends_at) <= now) return { label: "Закончился", tone: "neutral" };
  if (code.max_uses !== null && code.stats.uses >= code.max_uses) return { label: "Лимит исчерпан", tone: "neutral" };
  return { label: "Действует", tone: "success" };
}

/** Условия промокода коротко: «заказ от 2 000 ₽ · всего до 100 раз · 1 раз на покупателя». */
export function promoCodeConditions(code: PromoCode): string[] {
  const parts: string[] = [];
  if (code.min_order_kop) parts.push(`заказ от ${formatRub(code.min_order_kop)}`);
  if (code.max_uses !== null) parts.push(`всего до ${code.max_uses} ${plural(code.max_uses, "раза", "раз", "раз")}`);
  if (code.max_uses_per_customer !== null)
    parts.push(`${code.max_uses_per_customer} ${plural(code.max_uses_per_customer, "раз", "раза", "раз")} на покупателя`);
  if (code.first_order_only) parts.push("только первый заказ");
  if (code.applies_to_discounted) parts.push("и на товары со скидкой");
  return parts;
}

/** На что действует: «Да Хун Пао, Те Гуань Инь · категории: Улуны». */
export function scopeText(products: { name: string }[], categories: { name: string }[], empty = "на весь заказ"): string {
  const parts: string[] = [];
  if (products.length) parts.push(products.map((p) => p.name).join(", "));
  if (categories.length) parts.push(`${categories.length === 1 ? "категория" : "категории"}: ${categories.map((c) => c.name).join(", ")}`);
  return parts.length ? parts.join(" · ") : empty;
}

// ------------------------------------------------------------------ чай недели

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function dayMonth(date: Date): { day: number; month: string } {
  return { day: date.getUTCDate(), month: MONTHS[date.getUTCMonth()] ?? "" };
}

/** Срок скидки чая недели: «с 8 по 14 октября» (неделя) или «только 8 октября, с 00:00 до 23:59» (день). */
export function thursdayPeriodText(date: string, mode: string): string {
  const d = parseDate(date);
  if (!d) return "";
  const start = dayMonth(new Date(Date.UTC(d[0], d[1] - 1, d[2])));
  if (mode === "day") return `только ${start.day} ${start.month}, с 00:00 до 23:59`;
  const end = dayMonth(new Date(Date.UTC(d[0], d[1] - 1, d[2] + 6)));
  return start.month === end.month ? `с ${start.day} по ${end.day} ${end.month}` : `с ${start.day} ${start.month} по ${end.day} ${end.month}`;
}

export const THURSDAY_MODE_TEXT: Record<string, string> = {
  week: "Скидка действует неделю: с четверга 00:00 до следующего четверга 00:00 по Москве.",
  day: "Скидка действует только в четверг, с 00:00 до 23:59 по Москве.",
};

// ------------------------------------------------------------------ промокоды

const PROMO_CODE_RE = /^[A-Z0-9_-]{3,32}$/;
export const PROMO_CODE_ERROR = "Промокод — латинские буквы, цифры, дефис или подчёркивание, от 3 до 32 символов";

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Те же правила, что на сервере (`normalize_code`). */
export function isValidPromoCode(code: string): boolean {
  return PROMO_CODE_RE.test(normalizePromoCode(code));
}

/** Процент скидки из поля: целое 1–99, иначе `null`. */
export function parsePercent(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,2}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= 99 ? n : null;
}

export const PERCENT_ERROR = "Введите целое число от 1 до 99";

/** Целое положительное число из поля (лимиты): пусто — `null` (без ограничения), не число — `NaN`. */
export function parseLimit(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  return /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : Number.NaN;
}
