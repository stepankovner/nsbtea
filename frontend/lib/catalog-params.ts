/** Фильтры каталога живут в адресе страницы — ссылку можно отправить, поисковики видят страницы. */

export const SORTS = ["popular", "new", "price_asc", "price_desc", "name"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  popular: "Популярные",
  new: "Новинки",
  price_asc: "Дешевле",
  price_desc: "Дороже",
  name: "По названию",
};

export interface CatalogParams {
  q?: string;
  sort: Sort;
  page: number;
  in_stock: boolean;
  tags: string[];
  effect?: string;
  region?: string;
  shape?: string;
  price_min?: number;
  price_max?: number;
}

type Raw = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 && n < 10_000_000 ? n : undefined;
}

export function parseCatalogParams(raw: Raw): CatalogParams {
  const params: CatalogParams = { sort: "popular", page: 1, in_stock: false, tags: [] };
  const q = first(raw.q)?.trim();
  if (q) params.q = q.slice(0, 100);
  const sort = first(raw.sort);
  if (sort && (SORTS as readonly string[]).includes(sort)) params.sort = sort as Sort;
  params.page = Math.min(1000, positiveInt(first(raw.page)) ?? 1);
  params.in_stock = first(raw.in_stock) === "1";
  params.tags = (first(raw.tags) ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  for (const key of ["effect", "region", "shape"] as const) {
    const value = first(raw[key])?.trim();
    if (value) params[key] = value.slice(0, 100);
  }
  const min = positiveInt(first(raw.price_min));
  const max = positiveInt(first(raw.price_max));
  if (min !== undefined) params.price_min = min;
  if (max !== undefined) params.price_max = max;
  return params;
}

/** Адрес каталога с изменёнными фильтрами. Любая смена фильтра, кроме страницы, — на первую страницу. */
export function catalogHref(path: string, current: CatalogParams, change: Partial<CatalogParams>): string {
  const next: CatalogParams = { ...current, ...change };
  if (!("page" in change)) next.page = 1;
  const search = new URLSearchParams();
  if (next.q) search.set("q", next.q);
  if (next.sort !== "popular") search.set("sort", next.sort);
  if (next.in_stock) search.set("in_stock", "1");
  if (next.tags.length) search.set("tags", next.tags.join(","));
  for (const key of ["effect", "region", "shape"] as const) {
    const value = next[key];
    if (value) search.set(key, value);
  }
  if (next.price_min !== undefined) search.set("price_min", String(next.price_min));
  if (next.price_max !== undefined) search.set("price_max", String(next.price_max));
  if (next.page > 1) search.set("page", String(next.page));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Параметры для GET /api/catalog/products. */
export function catalogQuery(params: CatalogParams, category?: string) {
  return {
    category,
    q: params.q,
    sort: params.sort,
    page: params.page,
    in_stock: params.in_stock || undefined,
    tags: params.tags.length ? params.tags.join(",") : undefined,
    effect: params.effect,
    region: params.region,
    shape: params.shape,
    price_min: params.price_min,
    price_max: params.price_max,
    per_page: 24,
  };
}
