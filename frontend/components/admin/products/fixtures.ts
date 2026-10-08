/** Данные для тестов раздела «Товары» — в том виде, в каком их отдаёт сервер. */
import type { Schemas } from "@/lib/api/client";

type Product = Schemas["ProductOut"];
type ListItem = Schemas["ProductListItem"];
type Category = Schemas["CategoryOut"];
type Image = Schemas["ProductImageOut"];

export function adminProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    type: "tea",
    name: "Да Хун Пао",
    slug: "da-hun-pao",
    status: "published",
    status_label: "На сайте",
    category: { id: "c2", name: "Улун" },
    short_description: "Утёсный улун с нотами шоколада",
    description: null,
    hanzi: "大红袍",
    pinyin: "Da Hong Pao",
    price_per_gram_kop: 1200,
    price_input_base: 50,
    price_per_100g_kop: 120_000,
    unit_price_kop: null,
    stock: 600,
    stock_label: "600 г",
    low_stock_threshold: null,
    effective_threshold: 50,
    weight_presets: [25, 50, 100],
    cake_weight_grams: null,
    cake_price_kop: null,
    custom_weight_enabled: false,
    custom_weight_min: 10,
    custom_weight_step: 5,
    weight_grams: null,
    attributes: { region: "Уишань" },
    brewing: { methods: [], master_note: null },
    flavor_tags: [{ id: "t1", name: "шоколад", slug: "shokolad" }],
    search_aliases: [],
    images: [],
    relations: { similar_pinned: [], goes_with: [], set_contains: [] },
    weight_options: [
      { kind: "preset", grams: 25, label: "25 г", price_kop: 30_000, available: true },
      { kind: "preset", grams: 50, label: "50 г", price_kop: 60_000, available: true },
      { kind: "preset", grams: 100, label: "100 г", price_kop: 120_000, available: true },
    ],
    publish_problems: [],
    is_new_until: null,
    show_from: null,
    show_until: null,
    seo_title: null,
    seo_description: null,
    sort_order: 0,
    archived_at: null,
    created_at: "2026-10-01T09:00:00Z",
    updated_at: "2026-10-05T09:00:00Z",
    site_url: "https://nsbtea.ru/product/da-hun-pao",
    ...overrides,
  };
}

/** Только что созданный черновик чая: цены нет, граммовки — из общего списка. */
export function draftTea(overrides: Partial<Product> = {}): Product {
  return adminProduct({
    status: "draft",
    status_label: "Черновик",
    short_description: null,
    hanzi: null,
    pinyin: null,
    price_per_gram_kop: null,
    price_per_100g_kop: null,
    stock: 0,
    stock_label: "0 г",
    weight_presets: [25, 50, 100, 200],
    attributes: {},
    brewing: {},
    flavor_tags: [],
    weight_options: [],
    publish_problems: ["цену"],
    ...overrides,
  });
}

export function unitProduct(overrides: Partial<Product> = {}): Product {
  return adminProduct({
    id: "p5",
    type: "unit",
    name: "Гайвань белая",
    slug: "gaivan-belaya",
    category: { id: "c3", name: "Посуда" },
    short_description: null,
    hanzi: null,
    pinyin: null,
    price_per_gram_kop: null,
    price_per_100g_kop: null,
    unit_price_kop: 250_000,
    stock: 6,
    stock_label: "6 шт.",
    effective_threshold: 2,
    weight_presets: [],
    attributes: {},
    brewing: {},
    flavor_tags: [],
    weight_options: [],
    site_url: "https://nsbtea.ru/product/gaivan-belaya",
    ...overrides,
  });
}

export function productImage(n: number, overrides: Partial<Image> = {}): Image {
  return {
    id: `i${n}`,
    media_id: `m${n}`,
    url: `/media/images/${n}/original.webp`,
    srcset: { "320": `/media/images/${n}/320.webp` },
    alt: "Да Хун Пао",
    width: 1200,
    height: 1200,
    ...overrides,
  };
}

export function listItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: "p1",
    name: "Да Хун Пао",
    type: "tea",
    status: "published",
    status_label: "На сайте",
    category_name: "Улун",
    price_label: "12 ₽/г · 25 г — 300 ₽",
    price_per_gram_kop: 1200,
    unit_price_kop: null,
    stock: 600,
    stock_label: "600 г",
    stock_level: "ok",
    image_url: "/media/images/1/320.webp",
    archived_at: null,
    updated_at: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "c1",
    name: "Пуэр",
    slug: "puer",
    parent_id: null,
    sort_order: 0,
    description: null,
    seo_title: null,
    seo_description: null,
    is_visible: true,
    tile_color: "puer",
    cover: null,
    products_count: 0,
    archived_at: null,
    children: [],
    ...overrides,
  };
}

export const categoriesTree: Category[] = [
  category({
    id: "c1",
    name: "Пуэр",
    slug: "puer",
    products_count: 0,
    children: [
      category({ id: "c11", name: "Шу пуэр", slug: "shu-puer", parent_id: "c1", sort_order: 0, products_count: 12 }),
      category({ id: "c12", name: "Шен пуэр", slug: "shen-puer", parent_id: "c1", sort_order: 1, products_count: 1 }),
    ],
  }),
  category({ id: "c2", name: "Улун", slug: "ulun", sort_order: 1, tile_color: "oolong", products_count: 4 }),
  category({ id: "c3", name: "Посуда", slug: "posuda", sort_order: 2, tile_color: "neutral", products_count: 0 }),
];
