/**
 * Раздел «Товары»: запросы к API, ключи кэша и чистая логика формы товара
 * (что отправить на сервер, проверки до отправки, расчёт цен для предпросмотра).
 * Цены — целые копейки, вес — целые граммы (CLAUDE.md, правила 1–2).
 */
import { formatGrams } from "@/lib/format";

import { adminApi, must, type Schemas } from "./client";
import { uploadProductImages } from "./media";

export type AdminProduct = Schemas["ProductOut"];
export type ProductListItem = Schemas["ProductListItem"];
export type ProductPatch = Schemas["ProductPatchIn"];
export type RelationKind = Schemas["RelationKind"];
export type BrewMethod = Schemas["BrewMethod"];
export type TeaShape = Schemas["TeaShape"];
export type TeaEffect = Schemas["TeaEffect"];
export type ProductType = "tea" | "unit";
/** За сколько граммов владелец вводит цену чая. */
export type PriceBase = 1 | 50 | 100;

export type ProductsQuery = {
  q?: string;
  status?: string;
  category_id?: string;
  type?: string;
  stock?: string;
  archived?: boolean;
  page?: number;
  per_page?: number;
};

const path = (id: string) => ({ params: { path: { product_id: id } } });

export const productsApi = {
  list: (query: ProductsQuery) => must(adminApi.GET("/api/admin/products", { params: { query } })),
  get: (id: string) => must(adminApi.GET("/api/admin/products/{product_id}", path(id))),
  create: (body: Schemas["ProductCreateIn"]) => must(adminApi.POST("/api/admin/products", { body })),
  patch: (id: string, body: ProductPatch) => must(adminApi.PATCH("/api/admin/products/{product_id}", { ...path(id), body })),
  publish: (id: string) => must(adminApi.POST("/api/admin/products/{product_id}/publish", path(id))),
  hide: (id: string) => must(adminApi.POST("/api/admin/products/{product_id}/hide", path(id))),
  /** «Убрать в архив» — мягкое удаление, можно восстановить. */
  archive: (id: string) => must(adminApi.DELETE("/api/admin/products/{product_id}", path(id))),
  restore: (id: string) => must(adminApi.POST("/api/admin/products/{product_id}/restore", path(id))),
  copy: (id: string) => must(adminApi.POST("/api/admin/products/{product_id}/copy", path(id))),
  uploadImages: (id: string, files: File[]) => uploadProductImages(id, files),
  reorderImages: (id: string, ids: string[]) =>
    must(adminApi.POST("/api/admin/products/{product_id}/images/order", { ...path(id), body: { ids } })),
  updateImageAlt: (id: string, imageId: string, alt: string | null) =>
    must(
      adminApi.PATCH("/api/admin/products/{product_id}/images/{image_id}", {
        params: { path: { product_id: id, image_id: imageId } },
        body: { alt },
      }),
    ),
  deleteImage: (id: string, imageId: string) =>
    must(
      adminApi.DELETE("/api/admin/products/{product_id}/images/{image_id}", {
        params: { path: { product_id: id, image_id: imageId } },
      }),
    ),
  setRelations: (id: string, kind: RelationKind, ids: string[]) =>
    must(
      adminApi.PUT("/api/admin/products/{product_id}/relations/{kind}", {
        params: { path: { product_id: id, kind } },
        body: { product_ids: ids },
      }),
    ),
  /** Вкусовые ноты, которые уже есть у других товаров, — для подсказок при вводе. */
  tags: (q?: string) => must(adminApi.GET("/api/admin/tags", { params: { query: { q: q || undefined } } })),
  /** Общий список граммовок из «Настройки → Каталог» (настройки доступны только владельцу). */
  weightPresets: async (): Promise<number[]> => (await must(adminApi.GET("/api/admin/settings"))).catalog.weight_presets,
};

export const productKeys = {
  all: ["products"] as const,
  lists: ["products", "list"] as const,
  list: (query: ProductsQuery) => ["products", "list", query] as const,
  detail: (id: string) => ["products", "detail", id] as const,
  tags: (q: string) => ["products", "tags", q] as const,
  presets: ["products", "weight-presets"] as const,
};

// ------------------------------------------------------------------ подписи

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  tea: "Чай на развес",
  unit: "Штучный товар",
};

/** Граммовки по умолчанию на сервере — пока список из настроек недоступен (у сотрудника). */
export const DEFAULT_WEIGHT_PRESETS = [25, 50, 100, 200];
export const PRICE_BASES: PriceBase[] = [1, 50, 100];
export const MAX_PHOTOS = 10;

export const SHAPE_LABELS: Record<TeaShape, string> = {
  cake: "Блин",
  brick: "Кирпич",
  loose: "Рассыпной",
  tuocha: "Точа",
  other: "Другая",
};

export const EFFECT_LABELS: Record<TeaEffect, string> = {
  energizing: "Бодрит",
  calming: "Успокаивает",
  balanced: "Сбалансированный",
};

export const BREW_METHODS: BrewMethod[] = ["gongfu", "european", "boiling", "thermos", "cold"];
export const BREW_METHOD_LABELS: Record<BrewMethod, string> = {
  gongfu: "Пролив (гунфу)",
  european: "Европейский",
  boiling: "Варка",
  thermos: "Термос",
  cold: "Холодное заваривание",
};

export const ATTRIBUTE_LABELS = {
  tea_type: "Вид чая",
  region: "Регион",
  factory: "Производитель / фабрика",
  harvest_year: "Год сбора",
  pressing_year: "Год прессовки",
  fermentation: "Степень ферментации",
  shape: "Форма",
  effect: "Эффект",
} as const;

/** Вкладки списка по статусу; «Архив» — отдельный запрос (archived=true). */
export const PRODUCT_TABS: { value: string | null; label: string }[] = [
  { value: null, label: "Все" },
  { value: "published", label: "На сайте" },
  { value: "hidden", label: "Скрытые" },
  { value: "draft", label: "Черновики" },
  { value: "archived", label: "Архив" },
];

export type ProductState = "published" | "hidden" | "draft" | "archived";

export function productState(p: { status: string; archived_at: string | null }): ProductState {
  if (p.archived_at) return "archived";
  if (p.status === "published" || p.status === "hidden") return p.status;
  return "draft";
}

// ------------------------------------------------------------------ шаги мастера

export const WIZARD_STEP_COUNT = 7;

export function stepTitle(step: number, type: ProductType): string {
  switch (step) {
    case 1:
      return "Тип и категория";
    case 2:
      return "Название и описание";
    case 3:
      return "Фото";
    case 4:
      return type === "tea" ? "Цена и граммовки" : "Цена";
    case 5:
      return type === "tea" ? "Характеристики и заварка" : "Слова для поиска";
    case 6:
      return "Связанные товары";
    default:
      return "Предпросмотр и публикация";
  }
}

/** Секции карточки товара — для ссылок «где поправить». */
export const SECTION_IDS: Record<number, string> = {
  1: "product-main",
  2: "product-main",
  3: "product-photos",
  4: "product-price",
  5: "product-attributes",
  6: "product-relations",
  7: "product-seo",
};

/** Что сервер называет в «заполните: …» (backend: publish_problems) → шаг мастера. */
const PROBLEM_STEPS: Record<string, number> = {
  название: 2,
  категорию: 1,
  цену: 4,
  "хотя бы один вариант веса": 4,
};

export function problemSteps(problems: string[], type: ProductType): { problem: string; step: number; title: string }[] {
  return problems
    .filter((p) => p in PROBLEM_STEPS)
    .map((problem) => {
      const step = PROBLEM_STEPS[problem]!;
      return { problem, step, title: stepTitle(step, type) };
    });
}

/** «Чтобы показать товар на сайте, заполните: цену, хотя бы один вариант веса» → список нехваток. */
export function problemsInMessage(message: string): string[] {
  const match = /заполните:\s*(.+)$/i.exec(message);
  if (!match) return [];
  return match[1]!
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** На каком шаге поле, которое не принял сервер (например «attributes.harvest_year» → 5). */
export function fieldStep(field: string): number | null {
  const root = field.split(".")[0] ?? field;
  if (root === "name") return 2;
  if (root === "category_id") return 1;
  if (["short_description", "description", "hanzi", "pinyin"].includes(root)) return 2;
  if (
    [
      "price",
      "unit_price_kop",
      "weight_presets",
      "cake_weight_grams",
      "cake_price_kop",
      "custom_weight_enabled",
      "custom_weight_min",
      "custom_weight_step",
      "weight_grams",
    ].includes(root)
  )
    return 4;
  if (["attributes", "brewing", "flavor_tags", "search_aliases"].includes(root)) return 5;
  if (["slug", "seo_title", "seo_description"].includes(root)) return 7;
  return null;
}

// ------------------------------------------------------------------ цены (как на сервере, domain/pricing.py)

function roundHalfUpDiv(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Цена «за 1 / 50 / 100 г» → копейки за грамм (half-up, не меньше 1 коп.). */
export function pricePerGramFromInput(amountKop: number, perGrams: PriceBase): number {
  return Math.max(roundHalfUpDiv(amountKop, perGrams), 1);
}

/** Цена фасовки: граммы × цена за грамм, округлённая до целого рубля (half-up). */
export function packPriceKop(grams: number, pricePerGramKop: number): number {
  return roundHalfUpDiv(grams * pricePerGramKop, 100) * 100;
}

export interface WeightOptionPreview {
  kind: "preset" | "cake";
  grams: number;
  label: string;
  price_kop: number;
}

export function formPricePerGram(form: Pick<ProductForm, "price_kop" | "price_base">): number | null {
  return form.price_kop && form.price_kop > 0 ? pricePerGramFromInput(form.price_kop, form.price_base) : null;
}

/** Варианты веса, как их увидит покупатель, — по тому, что сейчас введено в форме. */
export function weightOptionsPreview(form: ProductForm): WeightOptionPreview[] {
  const ppg = formPricePerGram(form);
  if (ppg === null) return [];
  const options: WeightOptionPreview[] = [...new Set(form.weight_presets)]
    .sort((a, b) => a - b)
    .map((grams) => ({ kind: "preset", grams, label: formatGrams(grams), price_kop: packPriceKop(grams, ppg) }));
  if (form.cake_enabled && form.cake_weight_grams) {
    options.push({
      kind: "cake",
      grams: form.cake_weight_grams,
      label: `Весь блин, ${formatGrams(form.cake_weight_grams)}`,
      price_kop: form.cake_price_kop ?? packPriceKop(form.cake_weight_grams, ppg),
    });
  }
  return options;
}

/** Цена в списке каталога: за минимальную граммовку (или за 50 г). */
export function listingPricePreview(form: ProductForm): { grams: number; price_kop: number } | null {
  const ppg = formPricePerGram(form);
  if (ppg === null) return null;
  const grams = form.weight_presets.length ? Math.min(...form.weight_presets) : 50;
  return { grams, price_kop: packPriceKop(grams, ppg) };
}

// ------------------------------------------------------------------ форма товара

export interface AttributesForm {
  tea_type: string;
  region: string;
  factory: string;
  harvest_year: number | null;
  pressing_year: number | null;
  fermentation: string;
  shape: TeaShape | "";
  effect: TeaEffect | "";
}

export interface BrewMethodForm {
  method: BrewMethod;
  vessel: string;
  /** граммы на объём — бывает и 7,5 г, сервер это допускает */
  grams: number | null;
  volume_ml: number | null;
  temp_c: number | null;
  first_steep_sec: number | null;
  next_steep_sec: number | null;
  steeps: number | null;
  note: string;
}

export interface ProductForm {
  type: ProductType;
  name: string;
  category_id: string | null;
  short_description: string;
  description: unknown;
  hanzi: string;
  pinyin: string;
  /** цена чая за `price_base` граммов, копейки */
  price_kop: number | null;
  price_base: PriceBase;
  weight_presets: number[];
  cake_enabled: boolean;
  cake_weight_grams: number | null;
  cake_price_kop: number | null;
  custom_weight_enabled: boolean;
  custom_weight_min: number | null;
  custom_weight_step: number | null;
  unit_price_kop: number | null;
  weight_grams: number | null;
  low_stock_threshold: number | null;
  attributes: AttributesForm;
  brewing_methods: BrewMethodForm[];
  master_note: string;
  flavor_tags: string[];
  search_aliases: string[];
  slug: string;
  seo_title: string;
  seo_description: string;
}

export function emptyBrewMethod(method: BrewMethod): BrewMethodForm {
  return {
    method,
    vessel: "",
    grams: null,
    volume_ml: null,
    temp_c: null,
    first_steep_sec: null,
    next_steep_sec: null,
    steeps: null,
    note: "",
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function priceBase(value: number): PriceBase {
  return value === 1 || value === 100 ? value : 50;
}

export function formFromProduct(p: AdminProduct): ProductForm {
  const type: ProductType = p.type === "unit" ? "unit" : "tea";
  const base = priceBase(p.price_input_base);
  const a = p.attributes ?? {};
  const brewing = isRecord(p.brewing) ? p.brewing : {};
  const methods = Array.isArray(brewing.methods) ? brewing.methods.filter(isRecord) : [];
  return {
    type,
    name: p.name,
    category_id: p.category?.id ?? null,
    short_description: p.short_description ?? "",
    description: p.description ?? null,
    hanzi: p.hanzi ?? "",
    pinyin: p.pinyin ?? "",
    price_kop: p.price_per_gram_kop ? p.price_per_gram_kop * base : null,
    price_base: base,
    weight_presets: [...p.weight_presets].sort((x, y) => x - y),
    cake_enabled: p.cake_weight_grams !== null,
    cake_weight_grams: p.cake_weight_grams,
    cake_price_kop: p.cake_price_kop,
    custom_weight_enabled: p.custom_weight_enabled,
    custom_weight_min: p.custom_weight_min,
    custom_weight_step: p.custom_weight_step,
    unit_price_kop: p.unit_price_kop,
    weight_grams: p.weight_grams,
    low_stock_threshold: p.low_stock_threshold,
    attributes: {
      tea_type: str(a.tea_type),
      region: str(a.region),
      factory: str(a.factory),
      harvest_year: num(a.harvest_year),
      pressing_year: num(a.pressing_year),
      fermentation: str(a.fermentation),
      shape: (str(a.shape) as TeaShape) || "",
      effect: (str(a.effect) as TeaEffect) || "",
    },
    brewing_methods: methods
      .filter((m) => BREW_METHODS.includes(m.method as BrewMethod))
      .map((m) => ({
        method: m.method as BrewMethod,
        vessel: str(m.vessel),
        grams: num(m.grams),
        volume_ml: num(m.volume_ml),
        temp_c: num(m.temp_c),
        first_steep_sec: num(m.first_steep_sec),
        next_steep_sec: num(m.next_steep_sec),
        steeps: num(m.steeps),
        note: str(m.note),
      })),
    master_note: str(brewing.master_note),
    flavor_tags: p.flavor_tags.map((t) => t.name),
    search_aliases: [...p.search_aliases],
    slug: p.slug,
    seo_title: p.seo_title ?? "",
    seo_description: p.seo_description ?? "",
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hasContent(node: unknown): boolean {
  if (!isRecord(node)) return false;
  if (node.type === "text") return typeof node.text === "string" && node.text.trim().length > 0;
  if (node.type === "image" || node.type === "productCard" || node.type === "horizontalRule") return true;
  return Array.isArray(node.content) && node.content.some(hasContent);
}

/** Пустой документ редактора — это «описания нет». */
export function descriptionValue(doc: unknown): Record<string, unknown> | null {
  return isRecord(doc) && hasContent(doc) ? doc : null;
}

function attributesPayload(a: AttributesForm): Schemas["AttributesIn"] {
  const out: Schemas["AttributesIn"] = {};
  for (const key of ["tea_type", "region", "factory", "fermentation"] as const) {
    const value = a[key].trim();
    if (value) out[key] = value;
  }
  if (a.harvest_year !== null) out.harvest_year = a.harvest_year;
  if (a.pressing_year !== null) out.pressing_year = a.pressing_year;
  if (a.shape) out.shape = a.shape;
  if (a.effect) out.effect = a.effect;
  return out;
}

function methodPayload(m: BrewMethodForm): Schemas["BrewingMethodIn"] {
  const out: Schemas["BrewingMethodIn"] = { method: m.method };
  if (m.vessel.trim()) out.vessel = m.vessel.trim();
  for (const key of ["grams", "volume_ml", "temp_c", "first_steep_sec", "next_steep_sec", "steeps"] as const) {
    const value = m[key];
    if (value !== null) out[key] = value;
  }
  if (m.note.trim()) out.note = m.note.trim();
  return out;
}

function brewingPayload(form: ProductForm): Schemas["BrewingIn"] {
  return { methods: form.brewing_methods.map(methodPayload), master_note: textOrNull(form.master_note) };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const sortedPresets = (list: number[]) => [...new Set(list)].sort((x, y) => x - y);
const cakeWeight = (f: ProductForm) => (f.cake_enabled ? f.cake_weight_grams : null);
const cakePrice = (f: ProductForm) => (f.cake_enabled ? f.cake_price_kop : null);

/** Что изменилось по сравнению с сохранённым — только это и уходит на сервер (PATCH). */
export function productPatch(form: ProductForm, saved: ProductForm): ProductPatch {
  const patch: ProductPatch = {};
  const name = form.name.trim();
  if (name && name !== saved.name.trim()) patch.name = name;
  if (form.category_id !== saved.category_id) patch.category_id = form.category_id;
  for (const key of ["short_description", "hanzi", "pinyin", "seo_title", "seo_description"] as const) {
    const value = textOrNull(form[key]);
    if (value !== textOrNull(saved[key])) patch[key] = value;
  }
  const description = descriptionValue(form.description);
  if (!same(description, descriptionValue(saved.description))) patch.description = description;

  if (form.type === "tea") {
    if (form.price_kop && form.price_kop > 0 && (form.price_kop !== saved.price_kop || form.price_base !== saved.price_base)) {
      patch.price = { amount_kop: form.price_kop, per_grams: form.price_base };
    }
    const presets = sortedPresets(form.weight_presets);
    if (!same(presets, sortedPresets(saved.weight_presets))) patch.weight_presets = presets;
    if (cakeWeight(form) !== cakeWeight(saved)) patch.cake_weight_grams = cakeWeight(form);
    if (cakePrice(form) !== cakePrice(saved)) patch.cake_price_kop = cakePrice(form);
    if (form.custom_weight_enabled !== saved.custom_weight_enabled) patch.custom_weight_enabled = form.custom_weight_enabled;
    // минимум и шаг важны, только когда «свой вес» включён
    if (form.custom_weight_enabled) {
      if (form.custom_weight_min !== null && form.custom_weight_min !== saved.custom_weight_min) {
        patch.custom_weight_min = form.custom_weight_min;
      }
      if (form.custom_weight_step !== null && form.custom_weight_step !== saved.custom_weight_step) {
        patch.custom_weight_step = form.custom_weight_step;
      }
    }
    const attributes = attributesPayload(form.attributes);
    if (!same(attributes, attributesPayload(saved.attributes))) patch.attributes = attributes;
    const brewing = brewingPayload(form);
    if (!same(brewing, brewingPayload(saved))) patch.brewing = brewing;
  } else {
    if (form.unit_price_kop !== saved.unit_price_kop) patch.unit_price_kop = form.unit_price_kop;
    if (form.weight_grams !== saved.weight_grams) patch.weight_grams = form.weight_grams;
  }

  if (form.low_stock_threshold !== saved.low_stock_threshold) patch.low_stock_threshold = form.low_stock_threshold;
  if (!same(form.flavor_tags, saved.flavor_tags)) patch.flavor_tags = form.flavor_tags;
  if (!same(form.search_aliases, saved.search_aliases)) patch.search_aliases = form.search_aliases;
  const slug = form.slug.trim().toLowerCase();
  if (slug && slug !== saved.slug.trim().toLowerCase()) patch.slug = slug;
  return patch;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function inRange(value: number | null, min: number, max: number): boolean {
  return value === null || (value >= min && value <= max);
}

/** Проверки до отправки — чтобы не ждать ответа сервера на очевидные ошибки. Ключи — как у сервера. */
export function clientErrors(form: ProductForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Напишите название";
  if (form.type === "tea") {
    if (form.custom_weight_enabled) {
      const min = form.custom_weight_min;
      const step = form.custom_weight_step;
      if (!step) errors.custom_weight_step = "Укажите шаг, например 5 г";
      if (!min) errors.custom_weight_min = "Укажите минимальный вес, например 10 г";
      else if (step && min % step !== 0) {
        errors.custom_weight_min = `Минимум должен делиться на шаг: например ${step * 2} г при шаге ${step} г`;
      }
    }
    if (form.cake_enabled && !form.cake_weight_grams) errors.cake_weight_grams = "Укажите вес блина, например 357 г";
    for (const key of ["harvest_year", "pressing_year"] as const) {
      if (!inRange(form.attributes[key], 1900, 2100)) errors[`attributes.${key}`] = "Год — четыре цифры, например 2023";
    }
    form.brewing_methods.forEach((m, i) => {
      if (!inRange(m.temp_c, 1, 100)) errors[`brewing.methods.${i}.temp_c`] = "От 1 до 100 °C, например 95";
      if (!inRange(m.volume_ml, 10, 5000)) errors[`brewing.methods.${i}.volume_ml`] = "От 10 до 5000 мл, например 120";
      if (m.grams !== null && (m.grams <= 0 || m.grams > 100)) errors[`brewing.methods.${i}.grams`] = "От 0,5 до 100 г, например 7";
      if (!inRange(m.steeps, 1, 50)) errors[`brewing.methods.${i}.steeps`] = "От 1 до 50, например 8";
    });
  }
  const slug = form.slug.trim().toLowerCase();
  if (slug && !SLUG_RE.test(slug)) errors.slug = "Только латиница, цифры и дефисы, например da-hun-pao";
  return errors;
}
