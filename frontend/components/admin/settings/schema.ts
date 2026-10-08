/**
 * Поля формы настроек строятся по JSON-схеме группы с сервера (`GET /admin/settings/meta`):
 * подписи и пояснения — оттуда, а тип поля (деньги, проценты, граммы, выбор…) — по имени и схеме.
 * Здесь — только то, чего в схеме нет: разбивка на части, примеры в подсказках, подписи вариантов.
 */
import type { SettingsMeta } from "@/lib/admin/settings";

export type FieldKind = "money" | "number" | "boolean" | "text" | "textarea" | "choice" | "numberList" | "boxes";

export interface SettingField {
  key: string;
  label: string;
  /** пояснение с сервера — видно под полем */
  description?: string;
  /** подсказка «?» с примером — там, где пояснения с сервера нет или его мало */
  hint?: string;
  kind: FieldKind;
  nullable: boolean;
  unit?: string;
  options?: { value: string; label: string }[];
  maxLength?: number;
  inputMode?: "text" | "email" | "tel" | "url";
  /** подпись поля «добавить» у списка значений */
  addLabel?: string;
}

export interface SettingSection {
  title: string | null;
  description?: string;
  link?: { href: string; label: string };
  fields: SettingField[];
}

interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  anyOf?: JsonSchema[];
  $ref?: string;
  enum?: unknown[];
  items?: JsonSchema;
  maxLength?: number;
  $defs?: Record<string, JsonSchema>;
  properties?: Record<string, JsonSchema>;
}

const SECTIONS: Record<string, { title: string | null; description?: string; link?: { href: string; label: string }; keys: string[] }[]> = {
  store: [
    {
      title: "Магазин и контакты",
      description: "Покупатели видят это в подвале сайта и на странице контактов.",
      keys: ["shop_name", "phone", "email", "address", "work_hours", "telegram_url", "telegram_channel_url", "vk_url"],
    },
    {
      title: "Реквизиты ИП",
      description: "Показываются в подвале сайта и нужны для оферты. Возьмите их из выписки ЕГРИП или из банка.",
      keys: ["legal_name", "inn", "ogrnip", "legal_address"],
    },
  ],
  catalog: [
    { title: "Варианты веса чая", keys: ["weight_presets"] },
    { title: "Плашки и порядок товаров", keys: ["low_stock_tea_grams", "low_stock_units", "new_badge_days", "out_of_stock_last"] },
  ],
  loyalty: [
    { title: "Баллы", keys: ["earn_percent", "max_spend_percent", "points_ttl_days"] },
    { title: "Приветственная скидка", description: "Сообщается покупателю полоской на сайте и в корзине — без всплывающих окон.", keys: ["welcome_enabled", "welcome_percent"] },
  ],
  thursday: [
    {
      title: null,
      description: "Какие чаи участвуют в конкретный четверг, выбирается в календаре четвергов.",
      link: { href: "/admin/promotions/thursdays", label: "Открыть календарь четвергов" },
      keys: ["percent", "mode"],
    },
  ],
  delivery: [
    { title: "СДЭК", keys: ["cdek_enabled", "cdek_pvz_tariff", "cdek_door_tariff", "cdek_free_from_kop"] },
    { title: "Курьер по Владимиру", keys: ["courier_enabled", "courier_price_kop", "courier_free_from_kop", "courier_note"] },
    { title: "Самовывоз", keys: ["pickup_enabled", "pickup_address"] },
    {
      title: "Посылка",
      description: "Нужно для расчёта стоимости СДЭК.",
      keys: ["origin_city_name", "origin_city_code", "packaging_grams", "boxes"],
    },
    { title: "Завершение заказов", keys: ["auto_complete_days"] },
  ],
  payment: [
    { title: "Чеки", description: "Чеки покупателям формирует банк «Точка» — эти данные попадают в каждый чек.", keys: ["tax_system", "vat_type"] },
    { title: "Оплата при получении", keys: ["allow_pay_on_delivery"] },
  ],
  seo: [
    { title: "Поиск Яндекса", description: "Так главная страница выглядит в результатах поиска.", keys: ["home_title", "home_description"] },
    { title: "Аналитика", keys: ["metrika_id", "yandex_verification"] },
  ],
};

/** Примеры к полям. Пояснения с сервера не повторяем — только то, чего в них нет. */
const HINTS: Record<string, Record<string, string>> = {
  store: {
    shop_name: "Как магазин называется на сайте и в письмах. Например: НСБ Чай.",
    inn: "12 цифр из выписки ЕГРИП или из банка. Например: 330123456789.",
    ogrnip: "15 цифр из выписки ЕГРИП. Например: 324330000012345.",
    legal_address: "Адрес регистрации ИП, как в выписке ЕГРИП. Например: 600000, г. Владимир, ул. Ленина, д. 1, кв. 1.",
    phone: "Покупатели увидят его в подвале сайта. Например: +7 900 123-45-67.",
    email: "Покупатели увидят её в подвале сайта. Например: hello@nsbtea.ru.",
    address: "Коротко, для подвала сайта. Например: Владимир, центр.",
    work_hours: "Например: Пн–Пт 10:00–19:00, Сб 11:00–17:00.",
    telegram_url: "Куда писать с вопросами. Например: https://t.me/nsbtea.",
    telegram_channel_url: "Канал магазина с новостями. Например: https://t.me/nsbtea_channel.",
    vk_url: "Например: https://vk.com/nsbtea.",
  },
  catalog: {
    weight_presets: "Чтобы добавить вариант, впишите вес в граммах и нажмите «Добавить». Например: 150.",
  },
  loyalty: {
    earn_percent: "Например, 5: за товары на 2 000 ₽ покупатель получит 100 баллов.",
    max_spend_percent: "Например, 50: заказ на 2 000 ₽ можно оплатить баллами не больше чем на 1 000 ₽.",
    points_ttl_days: "Например, 365 — баллы сгорят через год после начисления.",
  },
  thursday: {
    percent: "Например, 20: чай за 1 000 ₽ в четверг будет стоить 800 ₽.",
  },
  delivery: {
    cdek_enabled: "Покупатель сможет выбрать доставку СДЭК до пункта выдачи или до двери.",
    cdek_free_from_kop: "Например, 5000 — при заказе от 5 000 ₽ доставку СДЭК оплачиваете вы.",
    courier_enabled: "Доставка по Владимиру, которую вы делаете сами.",
    courier_free_from_kop: "Например, 2000 — при заказе от 2 000 ₽ курьер бесплатно.",
    courier_note: "Покупатель увидит её, когда выберет курьера. Например: Привезём сами в удобное время.",
    pickup_enabled: "Покупатель сможет забрать заказ сам.",
    pickup_address: "Покупатель увидит его при оформлении заказа. Например: Владимир, ул. Ленина, 1 — позвоните заранее.",
    origin_city_name: "Только для подписи. Например: Владимир.",
    packaging_grams: "Например, 50 — коробка, пакет и наполнитель.",
  },
  seo: {
    home_title: "Название главной страницы в поиске Яндекса и во вкладке браузера, лучше до 70 символов. Например: НСБ Чай — китайский чай во Владимире.",
    home_description: "Одно-два предложения под названием в поиске. Например: Пуэры, улуны и белые чаи с доставкой по России.",
    yandex_verification:
      "В Яндекс Вебмастере: «Права доступа» → «Мета-тег». Скопируйте только то, что в кавычках после content=. Например: 1a2b3c4d5e6f7a8b.",
  },
};

/** Подписи вариантов, которых нет в схеме (в схеме — только коды). */
const ENUM_LABELS: Record<string, Record<string, string>> = {
  mode: { week: "Неделю", day: "День" },
};

const LIST_ADD_LABELS: Record<string, string> = {
  weight_presets: "Новый вариант веса, г",
};

const MONEY_SUFFIX = /,\s*коп\.?\s*$/;

function resolve(schema: JsonSchema, defs: Record<string, JsonSchema>): { schema: JsonSchema; nullable: boolean } {
  let nullable = false;
  let current = schema;
  if (current.anyOf) {
    nullable = current.anyOf.some((s) => s.type === "null");
    current = { ...current, ...(current.anyOf.find((s) => s.type !== "null") ?? {}), anyOf: undefined };
  }
  if (current.$ref) {
    const name = current.$ref.split("/").pop() ?? "";
    const target = defs[name] ?? {};
    // своя подпись и пояснение у поля важнее, чем у общего определения
    current = { ...target, ...current, title: schema.title ?? target.title, description: schema.description ?? target.description, $ref: undefined };
  }
  return { schema: current, nullable };
}

function unitFor(key: string): string | undefined {
  if (key.includes("percent")) return "%";
  if (key.endsWith("_grams")) return "г";
  if (key.endsWith("_days")) return "дн.";
  if (key.endsWith("_units")) return "шт.";
  if (key.endsWith("_cm")) return "см";
  return undefined;
}

function inputModeFor(key: string): SettingField["inputMode"] {
  if (key === "email") return "email";
  if (key === "phone") return "tel";
  if (key.endsWith("_url")) return "url";
  return "text";
}

function choiceOptions(key: string, schema: JsonSchema, meta: SettingsMeta): SettingField["options"] {
  const fromMeta = key === "tax_system" ? meta.tax_systems : key === "vat_type" ? meta.vat_types : null;
  if (fromMeta) return Object.entries(fromMeta).map(([value, label]) => ({ value, label }));
  if (schema.enum) {
    const labels = ENUM_LABELS[key] ?? {};
    return schema.enum.map((v) => ({ value: String(v), label: labels[String(v)] ?? String(v) }));
  }
  return undefined;
}

function toField(group: string, key: string, raw: JsonSchema, defs: Record<string, JsonSchema>, meta: SettingsMeta): SettingField | null {
  const { schema, nullable } = resolve(raw, defs);
  const base = {
    key,
    label: schema.title ?? key,
    description: schema.description,
    hint: HINTS[group]?.[key],
    nullable,
  };
  if (key.endsWith("_kop")) return { ...base, label: base.label.replace(MONEY_SUFFIX, ""), kind: "money" };
  const options = choiceOptions(key, schema, meta);
  if (options) return { ...base, kind: "choice", options };
  if (schema.type === "boolean") return { ...base, kind: "boolean" };
  if (schema.type === "integer" || schema.type === "number") return { ...base, kind: "number", unit: unitFor(key) };
  if (schema.type === "array") {
    const item = resolve(schema.items ?? {}, defs).schema;
    if (item.type === "integer") return { ...base, kind: "numberList", unit: base.label.endsWith(", г") ? "г" : undefined, addLabel: LIST_ADD_LABELS[key] ?? "Новое значение" };
    if (key === "boxes") return { ...base, kind: "boxes" };
    return null;
  }
  if (schema.type === "string") {
    const long = (schema.maxLength ?? 0) >= 300;
    return { ...base, kind: long ? "textarea" : "text", maxLength: schema.maxLength, inputMode: inputModeFor(key) };
  }
  return null;
}

/** Поля группы, разложенные по частям формы. Поля, которых нет в разбивке, — в конце. */
export function settingSections(group: string, meta: SettingsMeta): SettingSection[] {
  const groupMeta = meta.groups[group] as { schema?: JsonSchema } | undefined;
  const schema = groupMeta?.schema ?? {};
  const defs = schema.$defs ?? {};
  const fields = new Map<string, SettingField>();
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const field = toField(group, key, prop, defs, meta);
    if (field) fields.set(key, field);
  }
  const used = new Set<string>();
  const sections: SettingSection[] = [];
  for (const section of SECTIONS[group] ?? []) {
    const list = section.keys.flatMap((k) => {
      const f = fields.get(k);
      if (!f) return [];
      used.add(k);
      return [f];
    });
    if (list.length) sections.push({ title: section.title, description: section.description, link: section.link, fields: list });
  }
  const rest = [...fields.values()].filter((f) => !used.has(f.key));
  if (rest.length) sections.push({ title: sections.length ? "Другое" : null, fields: rest });
  return sections;
}

export function groupTitle(group: string, meta: SettingsMeta): string | null {
  const title = (meta.groups[group] as { title?: unknown } | undefined)?.title;
  return typeof title === "string" ? title : null;
}

// ------------------------------------------------------------------ значения формы

export type FormValues = Record<string, unknown>;
export type FormErrors = Record<string, string>;

const BOX_NUMBERS = ["max_weight_grams", "length_cm", "width_cm", "height_cm"] as const;

export const INTEGER_ERROR = "Введите целое число, например 5";
export const REQUIRED_ERROR = "Заполните поле";
const MONEY_REQUIRED = "Укажите сумму. Если бесплатно — 0";

/** Текст из поля → целое число. Пустое — null. */
function parseInteger(value: unknown): { value: number | null } | { error: string } {
  if (typeof value === "number") return { value };
  if (value === null || value === undefined) return { value: null };
  const text = String(value).replace(/\s/g, "");
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: INTEGER_ERROR };
  return { value: Number(text) };
}

/**
 * Значения формы → тело запроса (поля, введённые текстом, превращаются в числа) и ошибки по полям.
 * Неверные значения остаются как есть — так форма понимает, что изменения не сохранены.
 */
export function buildPayload(sections: SettingSection[], values: FormValues, baseline: FormValues): { payload: FormValues; errors: FormErrors } {
  const payload: FormValues = { ...baseline, ...values };
  const errors: FormErrors = {};
  for (const field of sections.flatMap((s) => s.fields)) {
    const value = values[field.key];
    if (field.kind === "number") {
      const parsed = parseInteger(value);
      if ("error" in parsed) errors[field.key] = parsed.error;
      else if (parsed.value === null && !field.nullable) errors[field.key] = REQUIRED_ERROR;
      else payload[field.key] = parsed.value;
    } else if (field.kind === "money") {
      if ((value === null || value === undefined) && !field.nullable) errors[field.key] = MONEY_REQUIRED;
    } else if (field.kind === "boxes" && Array.isArray(value)) {
      payload[field.key] = value.map((box: Record<string, unknown>, i) => {
        const next: Record<string, unknown> = { ...box, name: typeof box.name === "string" ? box.name.trim() : box.name };
        if (!next.name) errors[`${field.key}.${i}.name`] = REQUIRED_ERROR;
        for (const prop of BOX_NUMBERS) {
          const parsed = parseInteger(box[prop]);
          if ("error" in parsed) errors[`${field.key}.${i}.${prop}`] = parsed.error;
          else if (parsed.value === null) errors[`${field.key}.${i}.${prop}`] = REQUIRED_ERROR;
          else next[prop] = parsed.value;
        }
        return next;
      });
    }
  }
  return { payload, errors };
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Код новой коробки: служебный, покупателю и владельцу не показывается. */
export function newBoxCode(existing: unknown[]): string {
  const codes = new Set(existing.map((b) => (b && typeof b === "object" ? String((b as { code?: unknown }).code ?? "") : "")));
  let i = existing.length + 1;
  while (codes.has(`box${i}`)) i += 1;
  return `box${i}`;
}

/** Какому полю формы принадлежит ошибка сервера («boxes.0.name» → «boxes»). */
export function ownerField(errorKey: string, keys: string[]): string | null {
  return keys.find((k) => errorKey === k || errorKey.startsWith(`${k}.`)) ?? null;
}
