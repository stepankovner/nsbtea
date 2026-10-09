/**
 * Раздел «Сайт»: страницы, блоки главной, события (SPEC 9, 10.8).
 * Запросы к API, ключи кэша и чистые помощники (адреса, время по Москве, предпросмотр).
 */
import { formatRub, plural, TIME_ZONE } from "@/lib/format";
import { pageHref } from "@/lib/pages";

import { adminApi, must, type Schemas } from "./client";

export type AdminPage = Schemas["PageAdminOut"];
export type PageKind = Schemas["PageKind"];
export type HomeBlock = Schemas["AdminHomeBlockOut"];
export type HomeBlockKind = Schemas["HomeBlockKind"];
export type AdminEvent = Schemas["EventAdminOut"];
export type EventType = Schemas["EventType"];
export type Media = Schemas["MediaOut"];
export type EventPeriod = "upcoming" | "past";

// ------------------------------------------------------------------ API

export const pagesApi = {
  list: (archived = false) =>
    must(adminApi.GET("/api/admin/pages", { params: { query: { archived } } })),
  get: (id: string) =>
    must(adminApi.GET("/api/admin/pages/{page_id}", { params: { path: { page_id: id } } })),
  create: (body: Schemas["PageIn"]) => must(adminApi.POST("/api/admin/pages", { body })),
  patch: (id: string, body: Schemas["PagePatch"]) =>
    must(adminApi.PATCH("/api/admin/pages/{page_id}", { params: { path: { page_id: id } }, body })),
  archive: (id: string) =>
    must(adminApi.DELETE("/api/admin/pages/{page_id}", { params: { path: { page_id: id } } })),
  restore: (id: string) =>
    must(
      adminApi.POST("/api/admin/pages/{page_id}/restore", { params: { path: { page_id: id } } }),
    ),
};

export const homeApi = {
  list: () => must(adminApi.GET("/api/admin/home-blocks")),
  patch: (kind: HomeBlockKind, body: Schemas["HomeBlockPatch"]) =>
    must(adminApi.PATCH("/api/admin/home-blocks/{kind}", { params: { path: { kind } }, body })),
  reorder: (kinds: HomeBlockKind[]) =>
    must(adminApi.POST("/api/admin/home-blocks/reorder", { body: { kinds } })),
};

export const eventsApi = {
  list: (period: EventPeriod) =>
    must(adminApi.GET("/api/admin/events", { params: { query: { period } } })),
  get: (id: string) =>
    must(adminApi.GET("/api/admin/events/{event_id}", { params: { path: { event_id: id } } })),
  create: (body: Schemas["EventIn"]) => must(adminApi.POST("/api/admin/events", { body })),
  patch: (id: string, body: Schemas["EventPatch"]) =>
    must(
      adminApi.PATCH("/api/admin/events/{event_id}", { params: { path: { event_id: id } }, body }),
    ),
  archive: (id: string) =>
    must(adminApi.DELETE("/api/admin/events/{event_id}", { params: { path: { event_id: id } } })),
};

export const contentKeys = {
  pages: ["content", "pages"] as const,
  pageList: (archived: boolean) => ["content", "pages", "list", archived] as const,
  page: (id: string) => ["content", "pages", "detail", id] as const,
  blocks: ["content", "home"] as const,
  events: ["content", "events"] as const,
  eventList: (period: EventPeriod) => ["content", "events", "list", period] as const,
  event: (id: string) => ["content", "events", "detail", id] as const,
};

// ------------------------------------------------------------------ страницы

export const PAGE_KINDS: {
  value: PageKind;
  label: string;
  group: string;
  description: string;
  prefix: string;
}[] = [
  {
    value: "page",
    label: "Страница магазина",
    group: "Страницы магазина",
    description: "О магазине, доставка и оплата, контакты, опт. Ссылка вида nsbtea.ru/about",
    prefix: "/",
  },
  {
    value: "guide",
    label: "Как заваривать",
    group: "Как заваривать",
    description:
      "Статья-инструкция в разделе «Как заваривать». Ссылка вида nsbtea.ru/guides/gongfu",
    prefix: "/guides/",
  },
  {
    value: "legal",
    label: "Документ",
    group: "Документы",
    description:
      "Оферта, политика обработки персональных данных, согласие. Ссылка вида nsbtea.ru/legal/offer",
    prefix: "/legal/",
  },
];

export function pageKind(kind: string) {
  return PAGE_KINDS.find((k) => k.value === kind) ?? PAGE_KINDS[0]!;
}

/** Служебные страницы: на них ведут ссылки из меню, форм и оформления заказа — адрес менять нельзя. */
export const SYSTEM_PAGES: Record<string, string> = {
  about: "ссылка «О магазине» в меню и на главной",
  contacts: "ссылка «Контакты» и блок с телефоном и адресом",
  wholesale: "ссылка «Оптовые заказы» в меню и форма заявки на опт",
  ceremonies: "форма заявки на индивидуальную церемонию",
  offer: "ссылка на оферту при оформлении заказа",
  privacy: "ссылки на политику при оформлении заказа и в полоске о cookies",
  consent: "ссылка на согласие в формах заявок",
};

export function isSystemPage(slug: string): boolean {
  return slug in SYSTEM_PAGES;
}

/** Адрес страницы на сайте (относительный, как в меню витрины). */
export function pagePath(page: { kind: string; slug: string }): string {
  return pageHref(page);
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}; // prettier-ignore

const MAX_SLUG = 80;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Адрес из названия — так же, как его сделает сервер (backend/app/domain/slugs.py). */
export function slugify(text: string): string {
  const translit = [...text.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join("");
  let slug = translit.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > MAX_SLUG) slug = slug.slice(0, MAX_SLUG).replace(/-+$/, "");
  return slug;
}

/** Разделы витрины: страница магазина с таким адресом не откроется (её «перекроет» раздел). */
const RESERVED = new Set([
  "catalog",
  "product",
  "cart",
  "order",
  "events",
  "guides",
  "legal",
  "account",
  "admin",
  "api",
  "media",
]);

export function slugError(slug: string, kind: PageKind | "event"): string | null {
  const value = slug.trim();
  if (!value) return null;
  if (!SLUG_RE.test(value) || value.length > MAX_SLUG) {
    return "В адресе — только латиница, цифры и дефисы (без пробелов и дефиса в конце), например kak-zavarivat-puer";
  }
  if (kind === "page" && RESERVED.has(value))
    return `Адрес /${value} занят разделом сайта — выберите другой`;
  return null;
}

/** Для поисковиков: рекомендуемая длина, после которой Яндекс обрезает текст. */
export const SEO_TITLE_SOFT = 60;
export const SEO_DESCRIPTION_SOFT = 160;
export const SITE_NAME = "НСБ Чай";

// ------------------------------------------------------------------ время по Москве

function moscowWall(instant: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    weekday: get("weekday"),
  };
}

/** Смещение Москвы от UTC в минутах для этого момента (сейчас всегда +180, но не полагаемся). */
function moscowOffset(instant: number): number {
  const w = moscowWall(instant);
  const wall = Date.UTC(
    Number(w.year),
    Number(w.month) - 1,
    Number(w.day),
    Number(w.hour),
    Number(w.minute),
  );
  return Math.round((wall - Math.floor(instant / 60_000) * 60_000) / 60_000);
}

/** Поля «дата» и «время» (по Москве) → момент в UTC для API. */
export function fromMoscow(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const asUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(asUtc)) return null;
  const offset = moscowOffset(asUtc - 180 * 60_000);
  return new Date(asUtc - offset * 60_000).toISOString();
}

/** Момент из API → значения полей «дата» и «время» по Москве. */
export function toMoscow(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return { date: "", time: "" };
  const w = moscowWall(instant);
  return { date: `${w.year}-${w.month}-${w.day}`, time: `${w.hour}:${w.minute}` };
}

// ------------------------------------------------------------------ события

export const EVENT_TYPES: { value: EventType; label: string; example: string }[] = [
  { value: "ceremony", label: "Церемония", example: "Вечерняя чайная церемония во Владимире" },
  { value: "rafting", label: "Сплав на сапах", example: "Сплав по Клязьме с чаем на берегу" },
  { value: "lecture", label: "Лекция", example: "Лекция о пуэрах" },
  { value: "other", label: "Другое", example: "Дегустация, мастер-класс" },
];

const TYPE_LABELS: Record<string, string> = {
  ceremony: "Церемония",
  rafting: "Сплав на сапах",
  lecture: "Лекция",
  other: "Событие",
};

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const WEEKDAYS: Record<string, string> = {
  Mon: "Пн",
  Tue: "Вт",
  Wed: "Ср",
  Thu: "Чт",
  Fri: "Пт",
  Sat: "Сб",
  Sun: "Вс",
};

export interface EventPreviewInput {
  type: string;
  title: string;
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  place: string | null;
  duration_text: string | null;
  price_kop: number | null;
  price_text: string | null;
  seats_total: number | null;
  seats_taken: number;
  note: string | null;
  cover: Media | null;
  short_description: string | null;
  description: Record<string, unknown> | null;
}

/** Событие в том виде, в каком его отдаёт витрине сервер (content_public.event_out) — для предпросмотра. */
export function eventPreview(
  input: EventPreviewInput,
  now: Date = new Date(),
): Schemas["EventOut"] {
  const starts = input.starts_at ? new Date(input.starts_at).getTime() : now.getTime() + 86_400_000;
  const w = moscowWall(starts);
  const seatsLeft =
    input.seats_total === null ? null : Math.max(0, input.seats_total - input.seats_taken);
  const seatsLabel =
    seatsLeft === null
      ? null
      : seatsLeft === 0
        ? "Мест нет"
        : `Осталось ${seatsLeft} ${plural(seatsLeft, "место", "места", "мест")}`;
  const isPast = starts <= now.getTime();
  return {
    id: "preview",
    slug: input.slug || "preview",
    type: input.type,
    type_label: TYPE_LABELS[input.type] ?? "Событие",
    title: input.title || "Название события",
    starts_at: new Date(starts).toISOString(),
    ends_at: input.ends_at,
    day: String(Number(w.day)),
    month_label: MONTHS_GENITIVE[Number(w.month) - 1] ?? "",
    weekday: WEEKDAYS[w.weekday] ?? w.weekday,
    time: `${w.hour}:${w.minute}`,
    place: input.place,
    duration_text: input.duration_text,
    price_kop: input.price_kop,
    price_label: input.price_text || (input.price_kop ? formatRub(input.price_kop) : null),
    seats_total: input.seats_total,
    seats_left: seatsLeft,
    seats_label: seatsLabel,
    note: input.note,
    cover: input.cover,
    short_description: input.short_description,
    description: input.description,
    can_book: !isPast && (seatsLeft === null || seatsLeft > 0),
    is_past: isPast,
  };
}

/** Адрес события на сайте. */
export function eventPath(slug: string): string {
  return `/events/${slug}`;
}

/** «чт, 15 октября, 19:00» по Москве; для прошедших — с годом. */
export function eventWhen(iso: string, withYear = false): string {
  const w = moscowWall(new Date(iso).getTime());
  const weekday = (WEEKDAYS[w.weekday] ?? "").toLowerCase();
  const date = `${Number(w.day)} ${MONTHS_GENITIVE[Number(w.month) - 1] ?? ""}${withYear ? ` ${w.year}` : ""}`;
  return `${weekday}, ${date}, ${w.hour}:${w.minute}`;
}

/** «Записались 3 из 8» — сколько гостей уже в заявках (кроме отменённых). */
export function seatsSummary(
  event: Pick<AdminEvent, "seats_total" | "seats_taken">,
): string | null {
  if (event.seats_total === null)
    return event.seats_taken ? `Записались ${event.seats_taken}` : null;
  return `Записались ${event.seats_taken} из ${event.seats_total}`;
}

/** Пустой документ редактора — на сервер отправляем как «нет описания». */
/** Момент уже наступил (для подсказки «эта дата прошла»). */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

export function isEmptyDoc(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return true;
  const content = (doc as { content?: unknown[] }).content;
  return (
    !Array.isArray(content) ||
    content.length === 0 ||
    JSON.stringify(content) === '[{"type":"paragraph"}]'
  );
}

// ------------------------------------------------------------------ блоки главной

export type BlockFieldType =
  "text" | "textarea" | "link" | "image" | "number" | "products" | "color" | "items";

export interface BlockField {
  key: string;
  label: string;
  type: BlockFieldType;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  /** для type="items": поля одной карточки */
  fields?: BlockField[];
  /** для type="items": как назвать одну карточку («Карточка» / «карточку») */
  itemLabel?: string;
  itemAccusative?: string;
  /** для type="image": пропорции превью */
  aspect?: string;
  /** для type="color" */
  options?: { value: string; label: string; swatch: string }[];
}

export interface BlockSchema {
  /** название, если блока ещё нет на сервере (обычно приходит с сервера) */
  label: string;
  description: string;
  /** что подставляется само и где это настроить */
  auto?: { text: string; href: string; linkLabel: string };
  fields: BlockField[];
  /** блок можно показать в предпросмотре без данных с сервера (только тексты и фото) */
  preview: boolean;
}

const LINK_HINT =
  "Адрес на сайте, например /catalog или /events. Можно и полную ссылку: https://t.me/nsbtea";
const PHOTO_CAPTION: BlockField = {
  key: "image_caption",
  label: "Что на фото",
  type: "text",
  maxLength: 120,
  placeholder: "фото: чайная церемония",
  hint: "Коротко опишите фото, например «Никита за чайным столом». Это прочитают незрячие покупатели и поисковики, а пока фото нет — текст виден на его месте.",
};
const LIMIT = (label: string, max: number, example: number): BlockField => ({
  key: "limit",
  label,
  type: "number",
  min: 1,
  max,
  hint: `От 1 до ${max}, например ${example}. Лишнее не покажем.`,
});
const TITLE: BlockField = { key: "title", label: "Заголовок блока", type: "text", maxLength: 160 };

export const BLOCK_SCHEMAS: Record<HomeBlockKind, BlockSchema> = {
  hero: {
    label: "Главный баннер",
    description: "Первый экран сайта: крупный заголовок, короткий текст, кнопки и большое фото.",
    preview: true,
    fields: [
      {
        key: "title_line1",
        label: "Заголовок, первая строка",
        type: "text",
        maxLength: 60,
        placeholder: "Китайский чай",
      },
      {
        key: "title_line2",
        label: "Заголовок, вторая строка",
        type: "text",
        maxLength: 60,
        placeholder: "во Владимире",
      },
      {
        key: "text",
        label: "Текст под заголовком",
        type: "textarea",
        maxLength: 400,
        hint: "Два-три предложения: что за магазин и чем полезен. Например: «Пуэры и улуны с доставкой по Владимиру и России».",
      },
      {
        key: "kicker_left",
        label: "Мелкая надпись сверху слева",
        type: "text",
        maxLength: 60,
        placeholder: "Интернет-магазин · Владимир",
      },
      {
        key: "kicker_right",
        label: "Мелкая надпись сверху справа",
        type: "text",
        maxLength: 60,
        placeholder: "Чай · Церемонии · Сплавы",
      },
      {
        key: "primary_label",
        label: "Главная кнопка: надпись",
        type: "text",
        maxLength: 40,
        placeholder: "Выбрать чай",
        hint: "Оставьте пустым, чтобы убрать кнопку.",
      },
      {
        key: "primary_href",
        label: "Главная кнопка: куда ведёт",
        type: "link",
        placeholder: "/catalog",
        hint: LINK_HINT,
      },
      {
        key: "secondary_label",
        label: "Вторая кнопка: надпись",
        type: "text",
        maxLength: 40,
        placeholder: "Записаться на церемонию",
        hint: "Оставьте пустым, чтобы убрать кнопку.",
      },
      {
        key: "secondary_href",
        label: "Вторая кнопка: куда ведёт",
        type: "link",
        placeholder: "/events",
        hint: LINK_HINT,
      },
      {
        key: "image_media_id",
        label: "Фото",
        type: "image",
        aspect: "aspect-[16/10]",
        hint: "Горизонтальное фото, лучше 1600×1000 и больше. Например, церемония или чайный стол.",
      },
      PHOTO_CAPTION,
    ],
  },
  thursday: {
    label: "Чай недели",
    description: "Акция «Чай недели»: три чая со скидкой до следующего четверга.",
    auto: {
      text: "Товары и процент скидки выбираются в календаре четвергов. Блок виден, только пока идёт акция.",
      href: "/admin/promotions",
      linkLabel: "Открыть «Акции»",
    },
    preview: false,
    fields: [
      {
        key: "title",
        label: "Заголовок блока",
        type: "text",
        maxLength: 120,
        placeholder: "Три чая недели со скидкой",
        hint: "Рядом с заголовком сайт сам допишет процент скидки, например «Чай недели 15%».",
      },
      {
        key: "note",
        label: "Пояснение",
        type: "textarea",
        maxLength: 400,
        placeholder: "Каждый четверг Никита выбирает три чая…",
      },
    ],
  },
  services: {
    label: "Не только чай (церемонии, сплавы, выезд)",
    description:
      "Карточки «Не только чай»: церемонии, сплавы, выездные церемонии — с фото и кнопкой.",
    preview: true,
    fields: [
      { ...TITLE, placeholder: "Не только чай" },
      {
        key: "items",
        label: "Карточки",
        type: "items",
        itemLabel: "Карточка",
        itemAccusative: "карточку",
        max: 6,
        fields: [
          {
            key: "title",
            label: "Название",
            type: "text",
            maxLength: 80,
            placeholder: "Чайные церемонии",
          },
          {
            key: "text",
            label: "Описание",
            type: "textarea",
            maxLength: 300,
            placeholder: "Вечерние встречи: несколько чаёв одной темы…",
          },
          {
            key: "kicker",
            label: "Надпись на фото",
            type: "text",
            maxLength: 30,
            placeholder: "Во Владимире",
            hint: "Короткая метка в углу фото, например «На воде».",
          },
          {
            key: "chip_color",
            label: "Цвет надписи",
            type: "color",
            options: [
              { value: "ink", label: "Тёмный", swatch: "#1D231B" },
              { value: "green", label: "Зелёный", swatch: "#5C7650" },
              { value: "red", label: "Красный", swatch: "#8E3236" },
            ],
          },
          {
            key: "cta_label",
            label: "Кнопка: надпись",
            type: "text",
            maxLength: 40,
            placeholder: "Расписание",
            hint: "Оставьте пустым, чтобы убрать кнопку.",
          },
          {
            key: "cta_href",
            label: "Кнопка: куда ведёт",
            type: "link",
            placeholder: "/events?type=ceremony",
            hint: LINK_HINT,
          },
          {
            key: "image_media_id",
            label: "Фото карточки",
            type: "image",
            aspect: "aspect-[4/5]",
            hint: "Вертикальное фото 4:5, например 1200×1500.",
          },
        ],
      },
    ],
  },
  featured: {
    label: "Сейчас в наличии",
    description: "Подборка товаров «Сейчас в наличии».",
    preview: false,
    fields: [
      { ...TITLE, placeholder: "Сейчас в наличии" },
      {
        key: "product_ids",
        label: "Какие товары показать",
        type: "products",
        max: 12,
        hint: "Выберите товары в нужном порядке — не больше, чем указано в поле «Сколько товаров показать». Если ничего не выбрать — покажем первые товары, которые есть в наличии.",
      },
      LIMIT("Сколько товаров показать", 12, 4),
    ],
  },
  new_products: {
    label: "Новинки",
    description: "Новинки — товары с отметкой «Новинка».",
    auto: {
      text: "Сюда сами попадают товары, у которых в карточке стоит отметка «Новинка».",
      href: "/admin/products",
      linkLabel: "Открыть «Товары»",
    },
    preview: false,
    fields: [{ ...TITLE, placeholder: "Новинки" }, LIMIT("Сколько товаров показать", 12, 4)],
  },
  sets: {
    label: "Наборы",
    description: "Наборы — товары из категории «Наборы».",
    auto: {
      text: "Сюда сами попадают товары из категории «Наборы»: сначала те, что в наличии.",
      href: "/admin/products",
      linkLabel: "Открыть «Товары»",
    },
    preview: false,
    fields: [{ ...TITLE, placeholder: "Наборы" }, LIMIT("Сколько товаров показать", 12, 4)],
  },
  events: {
    label: "Ближайшие события",
    description: "Ближайшие церемонии, сплавы и лекции.",
    auto: {
      text: "Сюда сами попадают ближайшие события, которые показываются на сайте.",
      href: "/admin/content/events",
      linkLabel: "Открыть «События»",
    },
    preview: false,
    fields: [
      {
        key: "kicker",
        label: "Надпись над заголовком",
        type: "text",
        maxLength: 40,
        placeholder: "Расписание",
      },
      { ...TITLE, placeholder: "Ближайшие церемонии и сплавы" },
      LIMIT("Сколько событий показать", 6, 3),
    ],
  },
  about: {
    label: "О магазине и мастере",
    description: "О магазине и мастере: фото и пара абзацев. Ведёт на страницу «О магазине».",
    preview: true,
    fields: [
      {
        key: "kicker",
        label: "Надпись над текстом",
        type: "text",
        maxLength: 40,
        placeholder: "О магазине",
      },
      {
        key: "title",
        label: "Главная фраза",
        type: "textarea",
        maxLength: 200,
        placeholder: "НСБ — инициалы основателя, Никиты Сергеевича Булича.",
      },
      { key: "text", label: "Текст", type: "textarea", maxLength: 800 },
      {
        key: "image_media_id",
        label: "Фото",
        type: "image",
        aspect: "aspect-[4/5]",
        hint: "Вертикальное фото 4:5, например мастер за чайным столом.",
      },
      PHOTO_CAPTION,
    ],
  },
  advantages: {
    label: "Преимущества",
    description: "Преимущества: короткие карточки «почему у нас».",
    preview: true,
    fields: [
      { ...TITLE, placeholder: "Почему у нас" },
      {
        key: "items",
        label: "Карточки",
        type: "items",
        itemLabel: "Карточка",
        itemAccusative: "карточку",
        max: 6,
        fields: [
          {
            key: "title",
            label: "Заголовок карточки",
            type: "text",
            maxLength: 60,
            placeholder: "Любая граммовка",
          },
          {
            key: "text",
            label: "Текст карточки",
            type: "textarea",
            maxLength: 200,
            placeholder: "25, 50, 100 г, целый блин или свой вес.",
          },
        ],
      },
    ],
  },
  wholesale: {
    label: "Оптовые заказы",
    description: "Оптовые заказы: текст и форма заявки для кафе и магазинов.",
    auto: {
      text: "Под текстом — форма заявки на опт. Заявки приходят в раздел «Заявки» и в Telegram.",
      href: "/admin/applications",
      linkLabel: "Открыть «Заявки»",
    },
    preview: true,
    fields: [
      { ...TITLE, placeholder: "Оптовые заказы" },
      {
        key: "text",
        label: "Текст",
        type: "textarea",
        maxLength: 600,
        placeholder: "Чай для кафе, ресторанов, магазинов и корпоративных подарков…",
      },
    ],
  },
};

export function isBlockKind(kind: string): kind is HomeBlockKind {
  return kind in BLOCK_SCHEMAS;
}

const LINK_RE = /^(\/|https?:\/\/|tel:|mailto:)/;

/** Ссылка кнопки: адрес на сайте (/…) или полная ссылка. Пусто — можно. */
export function linkError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return LINK_RE.test(value.trim())
    ? null
    : "Ссылка должна начинаться с / (адрес на сайте) или с https://";
}

/** Короткая строка о содержимом блока для списка. */
export function blockSummary(block: HomeBlock): string {
  const d = block.data;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (block.kind === "hero") return [s(d.title_line1), s(d.title_line2)].filter(Boolean).join(" ");
  if (Array.isArray(d.items) && s(d.title)) {
    return `${s(d.title)} · ${d.items.length} ${plural(d.items.length, "карточка", "карточки", "карточек")}`;
  }
  return s(d.title) || s(d.text);
}
