import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";

import { Picture } from "@/components/shop/Picture";
import { RichText } from "@/components/shop/RichText";
import type { Schemas } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { pageHref } from "@/lib/pages";
import { getPage, PUBLIC_BASE_URL } from "@/lib/shop-server";

type Page = Schemas["PageOut"];

/** Страница нужного вида; если адрес другого раздела — постоянный редирект на правильный. */
export async function loadPage(slug: string, kind: "page" | "guide" | "legal"): Promise<Page> {
  const page = await getPage(slug);
  if (page.kind !== kind) permanentRedirect(pageHref(page));
  return page;
}

export function pageMetadata(page: Page): Metadata {
  const description = page.seo_description ?? page.excerpt ?? undefined;
  return {
    title: page.seo_title ?? page.title,
    description,
    alternates: { canonical: `${PUBLIC_BASE_URL}${pageHref(page)}` },
    openGraph: { title: page.title, description, images: [{ url: page.cover?.url ?? "/og-default.png" }] },
  };
}

export function ContentPage({
  page,
  kicker,
  aside,
  children,
}: {
  page: Page;
  kicker?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="container-site pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)]">
      {kicker ? <span className="kicker mb-6 block text-green">{kicker}</span> : null}
      <h1 className="mb-10 max-w-[1000px] font-serif text-[clamp(44px,6.5vw,96px)] leading-[0.98]">{page.title}</h1>
      <div className="grid gap-x-[clamp(32px,6vw,96px)] gap-y-12 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          {page.cover ? (
            <div className="aspect-[16/10] overflow-hidden bg-photo">
              <Picture media={page.cover} alt={page.title} sizes="(max-width: 1024px) 100vw, 720px" priority />
            </div>
          ) : null}
          <RichText doc={page.content} products={page.products} />
          {children}
          {page.kind === "legal" ? (
            <p className="font-mono text-xs text-muted">Редакция от {formatDate(page.updated_at)}</p>
          ) : null}
        </div>
        {aside ? <aside className="flex flex-col gap-6">{aside}</aside> : null}
      </div>
    </article>
  );
}
