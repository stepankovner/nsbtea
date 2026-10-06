"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { formatGrams } from "@/lib/format";
import { srcSetOf } from "@/lib/media";

import { useCart } from "./cart-context";
import { badgeColors, tileColors } from "./tile";
import { Price } from "./ui";

type Card = Schemas["ProductCard"];

export function variantLabel(product: Pick<Card, "name" | "type">, grams: number, kind: string): string {
  if (product.type !== "tea" || kind === "unit") return product.name;
  if (kind === "cake") return `${product.name}, весь блин ${formatGrams(grams)}`;
  return `${product.name}, ${formatGrams(grams)}`;
}

function Badges({ product }: { product: Card }) {
  if (!product.badges.length) return null;
  const sale = badgeColors(product.tile_color);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-1.5">
      {product.badges.map((badge) => {
        const isSale = badge.kind === "thursday" || badge.kind === "sale";
        return (
          <span
            key={`${badge.kind}-${badge.label}`}
            className="rounded-full px-2.5 py-[5px] font-mono text-[11px] tracking-[0.04em]"
            style={
              isSale
                ? { background: sale.bg, color: sale.fg }
                : badge.kind === "new"
                  ? { background: "#1D231B", color: "#F1EDE4" }
                  : { background: "#F1EDE4", color: "#1D231B" }
            }
          >
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}

export function TeaCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const { add } = useCart();
  const [busy, setBusy] = useState(false);
  const colors = tileColors(product.tile_color);
  const href = `/product/${product.slug}`;
  const variant = product.default_variant;

  async function onAdd() {
    if (!variant) return;
    setBusy(true);
    await add(
      { product_id: product.id, kind: variant.kind as Schemas["CartItemIn"]["kind"], grams: variant.grams, qty: 1 },
      variantLabel(product, variant.grams, variant.kind),
      { kop: product.price_kop, name: product.name },
    );
    setBusy(false);
  }

  return (
    <article className="flex flex-col gap-3.5 text-ink">
      <div className="relative aspect-[4/5] overflow-hidden" style={{ background: colors.bg, color: colors.fg }}>
        {product.image ? (
          <>
            <Link href={href} tabIndex={-1} className="absolute inset-y-0 left-0 right-[30%] bg-photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- WebP-варианты уже нарезаны сервером */}
              <img
                src={product.image.srcset["640"] ?? product.image.url}
                srcSet={srcSetOf(product.image.srcset)}
                sizes="(max-width: 640px) 70vw, 240px"
                alt={product.name}
                loading={priority ? "eager" : "lazy"}
                className="h-full w-full object-cover"
              />
            </Link>
            <Link
              href={href}
              aria-label={product.name}
              className="absolute inset-y-0 right-0 w-[30%] transition-opacity hover:opacity-85"
            >
              {product.hanzi ? (
                <span className="hanzi-vertical absolute left-1/2 top-5 -translate-x-1/2 text-[clamp(26px,2.4vw,34px)]">
                  {product.hanzi}
                </span>
              ) : null}
            </Link>
          </>
        ) : (
          <Link href={href} aria-label={product.name} className="absolute inset-0 transition-opacity hover:opacity-90">
            {product.hanzi ? (
              <span className="hanzi-vertical absolute right-[22px] top-6 text-[44px] tracking-[0.14em]">
                {product.hanzi}
              </span>
            ) : null}
            {product.pinyin ? (
              <span className="absolute left-5 top-[26px] font-mono text-[11px] tracking-[0.08em]">{product.pinyin}</span>
            ) : null}
          </Link>
        )}
        <Badges product={product} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Link href={href} className="font-serif text-[22px] leading-[1.2] text-ink hover:text-red">
          {product.name}
        </Link>
        {product.meta ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{product.meta}</span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-medium whitespace-nowrap">
          <Price kop={product.price_kop} oldKop={product.old_price_kop} oldClassName="text-[13px]" />
          {product.price_grams ? (
            <span className="font-normal text-muted">/ {formatGrams(product.price_grams)}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={!product.in_stock || !variant || busy}
          className={clsx(
            "whitespace-nowrap rounded-full border border-ink px-3.5 py-[7px] text-[13px] font-medium text-ink transition-colors",
            "hover:bg-ink hover:text-paper disabled:border-line disabled:text-muted disabled:hover:bg-transparent",
          )}
        >
          {product.in_stock ? "В корзину" : "Нет в наличии"}
        </button>
      </div>
    </article>
  );
}
