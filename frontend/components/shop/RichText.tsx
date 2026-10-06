/**
 * Текст из визуального редактора (TipTap JSON). Рисуем только разрешённые элементы —
 * тот же список, что проверяет сервер (backend/app/domain/richtext.py). Всё прочее пропускаем.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import type { Schemas } from "@/lib/api/client";
import { formatGrams, formatRub } from "@/lib/format";

import { tileColors } from "./tile";

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: Node[];
}

type Products = Record<string, Schemas["ProductCard"]>;

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^(https?:\/\/|\/|mailto:|tel:|#)/.test(value) ? value : null;
}

function renderText(node: Node, key: number): ReactNode {
  let out: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "link": {
        const href = safeUrl(mark.attrs?.href);
        if (!href) break;
        out = /^https?:\/\//.test(href) ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {out}
          </a>
        ) : href.startsWith("/") ? (
          <Link href={href}>{out}</Link>
        ) : (
          <a href={href}>{out}</a>
        );
        break;
      }
      default:
        break;
    }
  }
  return <span key={key}>{out}</span>;
}

function ProductInline({ product }: { product: Schemas["ProductCard"] }) {
  const colors = tileColors(product.tile_color);
  return (
    <Link
      href={`/product/${product.slug}`}
      className="not-prose flex items-stretch gap-4 border border-line bg-block no-underline transition-colors hover:border-ink"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <span
        className="relative flex w-20 flex-none items-start justify-end p-2"
        style={{ background: colors.bg, color: colors.fg }}
        aria-hidden="true"
      >
        {product.hanzi ? <span className="hanzi-vertical text-lg">{product.hanzi}</span> : null}
      </span>
      <span className="flex flex-col justify-center gap-1 py-3 pr-4">
        <span className="font-serif text-xl leading-tight text-ink">{product.name}</span>
        {product.meta ? <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{product.meta}</span> : null}
        <span className="text-[15px] font-medium text-ink">
          {formatRub(product.price_kop)}
          {product.price_grams ? <span className="font-normal text-muted"> / {formatGrams(product.price_grams)}</span> : null}
          {!product.in_stock ? <span className="font-normal text-muted"> · нет в наличии</span> : null}
        </span>
      </span>
    </Link>
  );
}

function renderNode(node: Node, key: number, products: Products): ReactNode {
  const children = () => (node.content ?? []).map((child, i) => renderNode(child, i, products));
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key}>{children()}</p>;
    case "heading": {
      const level = node.attrs?.level;
      if (level === 3) return <h3 key={key}>{children()}</h3>;
      if (level === 4) return <h4 key={key}>{children()}</h4>;
      return <h2 key={key}>{children()}</h2>;
    }
    case "bulletList":
      return <ul key={key}>{children()}</ul>;
    case "orderedList":
      return <ol key={key}>{children()}</ol>;
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = safeUrl(node.attrs?.src);
      if (!src) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      // eslint-disable-next-line @next/next/no-img-element -- картинки уже в WebP от сервера
      return <img key={key} src={src} alt={alt} loading="lazy" />;
    }
    case "productCard": {
      const slug = node.attrs?.slug;
      const product = typeof slug === "string" ? products[slug] : undefined;
      return product ? <ProductInline key={key} product={product} /> : null;
    }
    default:
      return null;
  }
}

export function RichText({
  doc,
  products = {},
  className,
}: {
  doc: unknown;
  products?: Products;
  className?: string;
}) {
  if (!doc || typeof doc !== "object") return null;
  const root = doc as Node;
  if (root.type !== "doc" || !root.content?.length) return null;
  return (
    <div className={className ?? "prose-nsb"}>{root.content.map((node, i) => renderNode(node, i, products))}</div>
  );
}
