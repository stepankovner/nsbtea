/**
 * «Было → стало» из журнала действий — человеческими словами.
 * На сервере diff — это {поле: [было, стало]}; здесь подписи полей и понятные значения:
 * деньги в рублях, статусы и разделы названиями, даты по Москве, сложные значения — «изменено».
 */
import { ENUM_LABELS, settingFieldLabel } from "@/components/admin/settings/schema";
import type { AuditEntry } from "@/lib/admin/audit";
import type { SettingsMeta } from "@/lib/admin/settings";
import { permissionsText, type PermissionOption } from "@/lib/admin/staff";
import { formatDate, formatDateTime, formatGrams, formatRub, plural } from "@/lib/format";

export const CHANGED = "изменено";
const EMPTY = "—";
const MAX_TEXT = 140;

export interface DiffRow {
  key: string;
  label: string;
  /** null — показываем только «изменено», без значений */
  before: string | null;
  after: string | null;
}

export interface DiffContext {
  settingsMeta?: SettingsMeta;
  permissions?: PermissionOption[];
}

const COMMON: Record<string, string> = {
  name: "Название",
  title: "Заголовок",
  slug: "Адрес страницы",
  status: "Статус",
  description: "Описание",
  is_published: "Опубликована",
  is_visible: "Видна на сайте",
  seo_title: "Заголовок для поисковиков",
  seo_description: "Описание для поисковиков",
  sort_order: "Порядок",
};

const BY_ENTITY: Record<string, Record<string, string>> = {
  product: {
    category_id: "Категория",
    short_description: "Краткое описание",
    hanzi: "Название иероглифами",
    pinyin: "Пиньинь",
    price_per_gram_kop: "Цена за 1 г",
    unit_price_kop: "Цена",
    weight_presets: "Варианты веса",
    cake_weight_grams: "Вес блина",
    cake_price_kop: "Цена блина",
    custom_weight_enabled: "Свой вес",
    custom_weight_min: "Свой вес: от",
    custom_weight_step: "Свой вес: шаг",
    weight_grams: "Вес товара",
    low_stock_threshold: "Порог «Осталось мало»",
    attributes: "Характеристики",
    brewing: "Заварка",
    search_aliases: "Другие названия для поиска",
    show_from: "Показывать с",
    show_until: "Показывать до",
    flavor_tags: "Вкусы",
    description_changed: "Описание",
    status: "Статус",
  },
  order: {
    status: "Статус",
    internal_comment: "Заметка",
    tracking_number: "Трек-номер",
    refunded_kop: "Возвращено",
  },
  customer: {
    notes: "Заметка о клиенте",
    points_balance: "Баллы",
  },
  admin_user: {
    permissions: "Разделы",
    expires_at: "Доступ до",
  },
  category: {
    parent_id: "Раздел каталога",
    tile_color: "Цвет плитки",
    cover_media_id: "Обложка",
  },
  application: {
    status: "Статус",
  },
};

const STATUS: Record<string, Record<string, string>> = {
  order: {
    awaiting_payment: "Ожидает оплаты",
    accepted: "Новый (оплата при получении)",
    paid: "Оплачен (новый)",
    assembling: "Собирается",
    shipped: "Передан в доставку",
    completed: "Выполнен",
    cancelled: "Отменён",
    refunded: "Возврат",
    needs_attention: "Требует внимания",
  },
  product: { draft: "Черновик", published: "На сайте", hidden: "Скрыт" },
  application: { new: "Новая", in_progress: "В работе", closed: "Закрыта", cancelled: "Отменена" },
};

/** Склад: в diff ключи — названия товаров, значения — остаток до и после. */
const STOCK_ENTITIES = new Set(["supply", "inventory"]);

const DATE_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function humanize(key: string): string {
  const text = key.replace(/_kop$/, "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function labelFor(entry: AuditEntry, key: string, ctx: DiffContext): string {
  if (STOCK_ENTITIES.has(entry.entity)) return `Остаток «${key}»`;
  if (entry.entity === "settings" && entry.entity_id && ctx.settingsMeta) {
    const label = settingFieldLabel(ctx.settingsMeta, entry.entity_id, key);
    if (label) return label;
  }
  return BY_ENTITY[entry.entity]?.[key] ?? COMMON[key] ?? humanize(key);
}

function isComplex(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((v) => typeof v === "object" && v !== null && !("name" in v));
  return typeof value === "object";
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_TEXT ? `${oneLine.slice(0, MAX_TEXT - 1)}…` : oneLine;
}

function formatValue(entry: AuditEntry, key: string, value: unknown, ctx: DiffContext): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) {
    if (!value.length) return EMPTY;
    if (key === "permissions") return permissionsText(value.map(String), ctx.permissions ?? []);
    return value
      .map((v) => (v && typeof v === "object" ? String((v as { name?: unknown }).name ?? "") : formatValue(entry, key, v, ctx)))
      .join(", ");
  }
  if (typeof value === "number") {
    if (key.endsWith("_kop")) return formatRub(value);
    if (key.endsWith("_grams") || key === "weight_presets") return formatGrams(value);
    if (key === "points_balance") return `${value} ${plural(value, "балл", "балла", "баллов")}`;
    return String(value);
  }
  const text = String(value);
  if (key === "status") return STATUS[entry.entity]?.[text] ?? text;
  if (entry.entity === "settings") {
    const meta = ctx.settingsMeta;
    if (key === "tax_system" && meta?.tax_systems[text]) return meta.tax_systems[text];
    if (key === "vat_type" && meta?.vat_types[text]) return meta.vat_types[text];
    if (ENUM_LABELS[key]?.[text]) return ENUM_LABELS[key][text];
  }
  if (DATE_TIME.test(text)) {
    const date = new Date(text.replace(" ", "T"));
    if (!Number.isNaN(date.getTime())) return formatDateTime(date);
  }
  if (DATE_ONLY.test(text)) return formatDate(`${text}T12:00:00+03:00`);
  return truncate(text);
}

/** Строки «было → стало» записи журнала. */
export function diffRows(entry: AuditEntry, ctx: DiffContext = {}): DiffRow[] {
  return Object.entries(entry.diff ?? {}).map(([key, change]) => {
    const label = labelFor(entry, key, ctx);
    const [before, after] = Array.isArray(change) && change.length === 2 ? change : [undefined, change];
    // ссылки на другие записи (…_id), тексты целиком (описание), вложенные данные — без значений
    const hidden = key.endsWith("_id") || key === "description_changed" || isComplex(before) || isComplex(after);
    if (hidden) return { key, label, before: null, after: null };
    return { key, label, before: formatValue(entry, key, before, ctx), after: formatValue(entry, key, after, ctx) };
  });
}

/** Куда перейти из записи журнала — если для этого есть экран. */
export function entryLink(entry: AuditEntry): { href: string; label: string } | null {
  const id = entry.entity_id;
  switch (entry.entity) {
    case "order":
      return id ? { href: `/admin/orders/${id}`, label: "Открыть заказ" } : null;
    case "product":
      return id ? { href: `/admin/products/${id}`, label: "Открыть товар" } : null;
    case "customer":
      return id ? { href: `/admin/customers/${id}`, label: "Открыть клиента" } : null;
    case "application":
      return id ? { href: `/admin/applications/${id}`, label: "Открыть заявку" } : null;
    case "settings":
      return id ? { href: `/admin/settings/${id}`, label: "Открыть настройки" } : null;
    case "thursday":
      return { href: "/admin/promotions/thursdays", label: "Календарь четвергов" };
    case "supply":
    case "inventory":
      return { href: "/admin/inventory", label: "Открыть склад" };
    case "admin_user":
      return entry.action.startsWith("staff.") ? { href: "/admin/staff", label: "К сотрудникам" } : null;
    default:
      return null;
  }
}
