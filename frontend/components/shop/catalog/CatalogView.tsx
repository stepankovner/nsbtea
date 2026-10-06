/** Каталог: категории, фильтры и сортировка — обычными ссылками (работают без JS и видны поисковикам). */
import clsx from "clsx";
import Link from "next/link";

import { TeaCard } from "@/components/shop/TeaCard";
import type { Schemas } from "@/lib/api/client";
import { catalogHref, SORT_LABELS, SORTS, type CatalogParams } from "@/lib/catalog-params";
import { plural } from "@/lib/format";

type Page = Schemas["CatalogPage"];
type Category = Schemas["PublicCategory"];

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex items-baseline gap-2 px-3.5 py-2 text-[15px] transition-colors",
        active ? "bg-ink text-paper" : "text-ink hover:bg-block",
      )}
    >
      {children}
    </Link>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={clsx(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink",
      )}
    >
      {children}
    </Link>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-mono text-muted">{title}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function CatalogView({
  data,
  params,
  path,
  categories,
  current,
  title,
}: {
  data: Page;
  params: CatalogParams;
  path: string;
  categories: Category[];
  current: Category | null;
  title: string;
}) {
  const f = data.facets;
  const toggleTag = (slug: string) =>
    params.tags.includes(slug) ? params.tags.filter((t) => t !== slug) : [...params.tags, slug];
  const hasFilters =
    params.in_stock || params.tags.length > 0 || !!params.effect || !!params.region || !!params.shape ||
    params.price_min !== undefined || params.price_max !== undefined;
  const pages = Math.max(1, Math.ceil(data.total / data.per_page));
  const parentSlug = current?.slug;
  const subcategories = current?.children ?? [];

  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-[clamp(52px,7vw,104px)] leading-[0.95]">{title}</h1>
        <span className="font-mono text-xs tracking-[0.08em] text-muted">
          {data.total} {plural(data.total, "товар", "товара", "товаров")} · доставка по Владимиру и России
        </span>
      </div>
      {current?.description ? <p className="mb-8 max-w-[720px] text-[17px] leading-[1.6] text-text2">{current.description}</p> : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-b-line border-t-ink py-3.5">
        <nav aria-label="Виды чая" className="flex flex-wrap gap-1.5">
          <Pill href={catalogHref("/catalog", params, {})} active={!current}>
            Все
          </Pill>
          {categories.map((c) => (
            <Pill key={c.id} href={catalogHref(`/catalog/${c.slug}`, params, {})} active={current?.id === c.id || c.children.some((ch) => ch.id === current?.id)}>
              {c.name}
              <span className="font-mono text-[11px] opacity-75">{c.products_count}</span>
            </Pill>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="label-mono text-muted">Порядок</span>
          {SORTS.filter((s) => s !== "name").map((s) => (
            <Link
              key={s}
              href={catalogHref(path, params, { sort: s })}
              scroll={false}
              aria-current={params.sort === s ? "true" : undefined}
              className={clsx("border-b py-1", params.sort === s ? "border-ink" : "border-transparent hover:border-line")}
            >
              {SORT_LABELS[s]}
            </Link>
          ))}
        </div>
      </div>

      {subcategories.length ? (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {subcategories.map((c) => (
            <Chip key={c.id} href={`/catalog/${c.slug}`} active={false}>
              {c.name}
            </Chip>
          ))}
        </div>
      ) : null}

      <details className="group mb-12 border-b border-line pb-5" open={hasFilters}>
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[15px] [&::-webkit-details-marker]:hidden">
          <span>Фильтры</span>
          <span className="transition-transform group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
          {hasFilters ? (
            <Link href={catalogHref(path, { ...params, tags: [] }, { in_stock: false, tags: [], effect: undefined, region: undefined, shape: undefined, price_min: undefined, price_max: undefined })} className="ml-4 text-sm text-red underline">
              Сбросить
            </Link>
          ) : null}
        </summary>
        <div className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <FilterGroup title="Наличие">
            <Chip href={catalogHref(path, params, { in_stock: !params.in_stock })} active={params.in_stock}>
              Только в наличии
            </Chip>
          </FilterGroup>
          {f.tags.length ? (
            <FilterGroup title="Во вкусе">
              {f.tags.map((t) => (
                <Chip key={t.slug} href={catalogHref(path, params, { tags: toggleTag(t.slug) })} active={params.tags.includes(t.slug)}>
                  {t.name}
                </Chip>
              ))}
            </FilterGroup>
          ) : null}
          {f.effects.length ? (
            <FilterGroup title="Эффект">
              {f.effects.map((o) => (
                <Chip key={o.value} href={catalogHref(path, params, { effect: params.effect === o.value ? undefined : o.value })} active={params.effect === o.value}>
                  {o.label}
                </Chip>
              ))}
            </FilterGroup>
          ) : null}
          {f.shapes.length ? (
            <FilterGroup title="Форма">
              {f.shapes.map((o) => (
                <Chip key={o.value} href={catalogHref(path, params, { shape: params.shape === o.value ? undefined : o.value })} active={params.shape === o.value}>
                  {o.label}
                </Chip>
              ))}
            </FilterGroup>
          ) : null}
          {f.regions.length ? (
            <FilterGroup title="Регион">
              {f.regions.map((o) => (
                <Chip key={o.value} href={catalogHref(path, params, { region: params.region === o.value ? undefined : o.value })} active={params.region === o.value}>
                  {o.label}
                </Chip>
              ))}
            </FilterGroup>
          ) : null}
          {f.price_per_100g ? (
            <form method="get" action={path} className="flex flex-col gap-2.5">
              <span className="label-mono text-muted">Цена за 100 г, ₽</span>
              {Object.entries({
                q: params.q,
                sort: params.sort !== "popular" ? params.sort : undefined,
                in_stock: params.in_stock ? "1" : undefined,
                tags: params.tags.join(",") || undefined,
                effect: params.effect,
                region: params.region,
                shape: params.shape,
              }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
              <div className="flex items-end gap-3">
                <input
                  name="price_min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label="Цена от"
                  placeholder={`от ${Math.floor(f.price_per_100g.min_kop / 100)}`}
                  defaultValue={params.price_min}
                  className="w-24 rounded-none border-0 border-b border-ink bg-transparent py-1.5 outline-none"
                />
                <input
                  name="price_max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label="Цена до"
                  placeholder={`до ${Math.ceil(f.price_per_100g.max_kop / 100)}`}
                  defaultValue={params.price_max}
                  className="w-24 rounded-none border-0 border-b border-ink bg-transparent py-1.5 outline-none"
                />
                <button type="submit" className="rounded-full border border-ink px-3 py-1.5 text-sm hover:bg-ink hover:text-paper">
                  Показать
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </details>

      {data.items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-x-6 gap-y-14">
          {data.items.map((p, i) => (
            <TeaCard key={p.id} product={p} priority={i < 4} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-5 border-t border-ink py-10">
          <span className="text-lg text-text2">
            {params.q ? `По запросу «${params.q}» ничего не нашлось.` : "Под эти условия ничего не подошло."}
          </span>
          <Link href={parentSlug ? `/catalog/${parentSlug}` : "/catalog"} className="text-red underline">
            Показать весь каталог
          </Link>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Страницы" className="mt-14 flex flex-wrap items-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={catalogHref(path, params, { page: n })}
              aria-current={n === params.page ? "page" : undefined}
              className={clsx("min-w-11 px-3 py-2 text-center", n === params.page ? "bg-ink text-paper" : "hover:bg-block")}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
