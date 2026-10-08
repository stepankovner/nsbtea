"use client";

/**
 * «Как это увидит покупатель» (SPEC 10.1). Отдельного режима предпросмотра в API нет,
 * поэтому собираем карточку здесь — из того, что сейчас в форме, — а описание и блок
 * «Как заварить» рисуем теми же компонентами, что и витрина.
 */
import { useId, type CSSProperties } from "react";

import { Brewing } from "@/components/shop/product/Brewing";
import { RichText } from "@/components/shop/RichText";
import { tileColors } from "@/components/shop/tile";
import {
  ATTRIBUTE_LABELS,
  BREW_METHOD_LABELS,
  descriptionValue,
  EFFECT_LABELS,
  formPricePerGram,
  listingPricePreview,
  SHAPE_LABELS,
  weightOptionsPreview,
  type AdminProduct,
  type ProductForm,
} from "@/lib/admin/products";
import type { Schemas } from "@/lib/api/client";
import { formatGrams, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

/** В админке «muted» — светлый фон; внутри предпросмотра возвращаем витринный приглушённый текст. */
const SHOP_TOKENS = { "--muted": "#5c6656" } as CSSProperties;

function attributeRows(form: ProductForm): { label: string; value: string }[] {
  const a = form.attributes;
  const rows: [string, string | number | null][] = [
    [ATTRIBUTE_LABELS.tea_type, a.tea_type.trim()],
    [ATTRIBUTE_LABELS.region, a.region.trim()],
    [ATTRIBUTE_LABELS.factory, a.factory.trim()],
    [ATTRIBUTE_LABELS.harvest_year, a.harvest_year],
    [ATTRIBUTE_LABELS.pressing_year, a.pressing_year],
    [ATTRIBUTE_LABELS.fermentation, a.fermentation.trim()],
    [ATTRIBUTE_LABELS.shape, a.shape ? SHAPE_LABELS[a.shape] : ""],
    [ATTRIBUTE_LABELS.effect, a.effect ? EFFECT_LABELS[a.effect] : ""],
  ];
  return rows.filter(([, v]) => v !== null && v !== "").map(([label, value]) => ({ label, value: String(value) }));
}

function brewingOut(form: ProductForm): Schemas["BrewingOut"] | null {
  if (!form.brewing_methods.length && !form.master_note.trim()) return null;
  return {
    master_note: form.master_note.trim() || null,
    methods: form.brewing_methods.map((m) => ({
      method: m.method,
      method_label: BREW_METHOD_LABELS[m.method],
      vessel: m.vessel.trim() || null,
      grams: m.grams,
      volume_ml: m.volume_ml,
      temp_c: m.temp_c,
      first_steep_sec: m.first_steep_sec,
      next_steep_sec: m.next_steep_sec,
      steeps: m.steeps,
      note: m.note.trim() || null,
    })),
  };
}

export function ProductPreview({
  form,
  product,
  categoryName,
  tileColor,
}: {
  form: ProductForm;
  product: AdminProduct;
  categoryName?: string | null;
  tileColor?: string | null;
}) {
  const titleId = useId();
  const isTea = form.type === "tea";
  const options = isTea ? weightOptionsPreview(form) : [];
  const ppg = isTea ? formPricePerGram(form) : null;
  const listing = isTea ? listingPricePreview(form) : null;
  const inStock = product.stock > 0;
  const lowStock = inStock && product.stock <= product.effective_threshold;
  const cover = product.images[0];
  const colors = tileColors(tileColor);
  const name = form.name.trim() || "Без названия";
  const attributes = isTea ? attributeRows(form) : [];
  const brewing = isTea ? brewingOut(form) : null;
  const description = descriptionValue(form.description);
  const stockBadge = !inStock ? "Нет в наличии" : lowStock ? "Осталось мало" : null;
  const priceMissing = isTea ? ppg === null : !form.unit_price_kop;

  return (
    <section aria-labelledby={titleId} style={SHOP_TOKENS} className="flex flex-col gap-4 rounded-xl border bg-paper p-4 text-ink md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-lg font-semibold">
          Как это увидит покупатель
        </h2>
        <p className="text-sm text-muted">
          Так товар будет выглядеть на сайте. Цены посчитаны по введённой цене — так же, как их посчитает сайт.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* карточка в каталоге */}
        <div className="flex flex-col gap-2" aria-label="Карточка в каталоге">
          <span className="text-xs uppercase tracking-wide text-muted">В каталоге</span>
          <div className="relative aspect-square overflow-hidden" style={{ background: colors.bg, color: colors.fg }}>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- превью из медиатеки
              <img src={cover.srcset["640"] ?? cover.srcset["320"] ?? cover.url} alt={cover.alt ?? name} className="h-full w-full object-cover" />
            ) : form.hanzi.trim() ? (
              <span className="hanzi-vertical absolute right-5 top-5 text-[44px]">{form.hanzi.trim()}</span>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm opacity-70">Нет фото</span>
            )}
            {stockBadge ? (
              <span className="absolute bottom-2 left-2 rounded-full bg-paper px-2.5 py-1 font-mono text-[11px] text-ink">{stockBadge}</span>
            ) : null}
          </div>
          <span className="break-words font-serif text-xl leading-tight">{name}</span>
          {isTea && listing ? (
            <span className="text-[15px]">
              {formatRub(listing.price_kop)} <span className="text-muted">· {formatGrams(listing.grams)}</span>
              <span className="block text-sm text-muted">{formatRub(ppg!)}/г</span>
            </span>
          ) : !isTea && form.unit_price_kop ? (
            <span className="text-[15px]">{formatRub(form.unit_price_kop)}</span>
          ) : (
            <span className="text-sm text-red">Цена не указана</span>
          )}
        </div>

        {/* страница товара */}
        <article className="flex min-w-0 flex-col gap-5" aria-label="Страница товара">
          <span className="text-xs uppercase tracking-wide text-muted">Страница товара</span>
          {product.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {product.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element -- превью из медиатеки
                <img key={img.id} src={img.srcset["320"] ?? img.url} alt={img.alt ?? name} className="size-20 shrink-0 object-cover" />
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {categoryName ? <span className="kicker text-green">{categoryName}</span> : null}
            <h3 className="break-words font-serif text-[clamp(28px,4vw,44px)] leading-[1.05]">{name}</h3>
            {form.short_description.trim() ? <p className="text-[16px] leading-relaxed text-text2">{form.short_description.trim()}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            {isTea ? (
              options.length || form.custom_weight_enabled ? (
                <>
                  <ul className="flex flex-wrap gap-2">
                    {options.map((o) => (
                      <li
                        key={`${o.kind}-${o.grams}`}
                        className={cn("flex flex-col border border-ink px-3 py-2 text-[15px]", (!inStock || o.grams > product.stock) && "opacity-50")}
                      >
                        <span>{o.label}</span>
                        <span className="font-medium">{formatRub(o.price_kop)}</span>
                      </li>
                    ))}
                    {form.custom_weight_enabled ? (
                      <li className="flex flex-col border border-dashed border-ink px-3 py-2 text-[15px]">
                        <span>Свой вес</span>
                        <span className="text-sm text-muted">
                          от {formatGrams(form.custom_weight_min ?? 10)}, шаг {formatGrams(form.custom_weight_step ?? 5)}
                        </span>
                      </li>
                    ) : null}
                  </ul>
                  {ppg ? <span className="text-sm text-muted">{formatRub(ppg)}/г</span> : null}
                </>
              ) : (
                <span className="text-sm text-red">Не выбрано ни одной граммовки — купить будет нельзя</span>
              )
            ) : form.unit_price_kop ? (
              <span className="font-serif text-3xl">{formatRub(form.unit_price_kop)}</span>
            ) : null}
            {priceMissing ? <span className="text-sm text-red">Цена не указана — товар нельзя показать на сайте</span> : null}
            <span className={cn("text-[15px]", inStock ? (lowStock ? "text-red" : "text-green") : "text-red")}>
              {inStock ? (lowStock ? "Осталось мало" : "В наличии") : "Нет в наличии"}
            </span>
            {!inStock ? (
              <span className="rounded-md bg-block px-3 py-2 text-sm text-text2">
                Остатка пока нет — примите поставку в «Складе», и товар можно будет купить.
              </span>
            ) : null}
          </div>

          {isTea && form.flavor_tags.length ? (
            <div className="flex flex-col gap-1">
              <span className="label-mono text-muted">Во вкусе</span>
              <span className="font-serif text-xl leading-snug">{form.flavor_tags.join(", ")}</span>
            </div>
          ) : null}

          {attributes.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[15px]">
              {attributes.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {description ? <RichText doc={description} /> : null}
          {brewing ? <Brewing brewing={brewing} /> : null}
        </article>
      </div>
    </section>
  );
}
