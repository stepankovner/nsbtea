import type { Metadata } from "next";
import Link from "next/link";

import { Brewing } from "@/components/shop/product/Brewing";
import { FavoriteButton } from "@/components/shop/product/FavoriteButton";
import { Gallery } from "@/components/shop/product/Gallery";
import { ProductPurchase } from "@/components/shop/ProductPurchase";
import { RichText } from "@/components/shop/RichText";
import { TeaCard } from "@/components/shop/TeaCard";
import { badgeColors, tileColors } from "@/components/shop/tile";
import type { Schemas } from "@/lib/api/client";
import { formatGrams, formatRub } from "@/lib/format";
import { breadcrumbsJsonLd, jsonLdString, productJsonLd } from "@/lib/seo";
import { getProduct, PUBLIC_BASE_URL } from "@/lib/shop-server";

export async function generateMetadata(props: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProduct(slug);
  const priceText = product.price_grams
    ? `${formatRub(product.price_kop)} за ${formatGrams(product.price_grams)}`
    : formatRub(product.price_kop);
  return {
    title: { absolute: product.seo.title },
    description: product.seo.description,
    alternates: { canonical: product.seo.canonical },
    openGraph: {
      type: "website",
      title: `${product.name} — ${priceText}`,
      description: product.seo.description,
      url: product.seo.canonical,
      images: [{ url: product.seo.og_image ?? "/og-default.png" }],
    },
  };
}

function Related({ title, items }: { title: string; items: Schemas["ProductCard"][] }) {
  if (!items.length) return null;
  return (
    <section className="container-site pt-[clamp(64px,8vw,120px)]">
      <h2 className="mb-8 font-serif text-[clamp(32px,3.6vw,48px)]">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-x-6 gap-y-12">
        {items.map((p) => (
          <TeaCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

export default async function ProductPage(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const p = await getProduct(slug);
  const colors = tileColors(p.tile_color);
  const badge = badgeColors(p.tile_color);
  const sale = p.badges.find((b) => b.kind === "thursday" || b.kind === "sale");
  const crumbs = [{ name: "Каталог", href: "/catalog" }, ...p.breadcrumbs, { name: p.name, href: `/product/${p.slug}` }];
  const cover = p.images[0];

  return (
    <>
      <section className="flex flex-wrap">
        <div
          className="relative min-h-[260px] flex-[1_1_420px] overflow-hidden md:min-h-[clamp(440px,80vh,820px)]"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {cover && !p.hanzi ? (
            // eslint-disable-next-line @next/next/no-img-element -- главное фото без иероглифов
            <img src={cover.srcset["1024"] ?? cover.url} alt={cover.alt} className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <Link
            href={p.category ? `/catalog/${p.category.slug}` : "/catalog"}
            className="absolute left-[clamp(20px,3vw,40px)] top-6 text-sm hover:underline md:top-8"
          >
            ← {p.category?.name ?? "Каталог"}
          </Link>
          {p.hanzi ? (
            <span className="hanzi-vertical absolute right-[clamp(24px,4vw,64px)] top-8 text-[52px] md:top-10 md:text-[clamp(72px,10vw,150px)]">
              {p.hanzi}
            </span>
          ) : null}
          {sale ? (
            <span
              className="absolute left-[clamp(20px,3vw,40px)] top-[64px] rounded-full px-3 py-1.5 font-mono text-xs md:top-[76px]"
              style={{ background: badge.bg, color: badge.fg }}
            >
              {sale.label}
            </span>
          ) : null}
          {p.pinyin ? (
            <span className="absolute bottom-6 left-[clamp(20px,3vw,40px)] font-mono text-[13px] md:bottom-8">{p.pinyin}</span>
          ) : null}
        </div>

        <div className="flex max-w-[760px] flex-[1_1_460px] flex-col gap-8 px-[clamp(20px,4vw,64px)] py-[clamp(28px,5vw,72px)]">
          <div className="flex flex-col gap-3.5">
            {p.meta ? <span className="kicker text-green">{p.meta}</span> : null}
            <h1 className="font-serif text-[clamp(38px,5vw,76px)] leading-[1.02]">{p.name}</h1>
            {p.promotion_title ? <span className="text-sm text-red">{p.promotion_title}</span> : null}
          </div>
          {p.short_description ? (
            <p className="text-[17px] leading-[1.65] text-text2 [text-wrap:pretty]">{p.short_description}</p>
          ) : null}
          <div className="order-none">
            <ProductPurchase product={p} />
          </div>
          <FavoriteButton productId={p.id} slug={p.slug} />
          {p.flavor_tags.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-mono text-muted">Во вкусе</span>
              <span className="font-serif text-2xl leading-[1.3]">{p.flavor_tags.map((t) => t.name).join(", ")}</span>
            </div>
          ) : null}
          {p.brewing_summary ? (
            <div className="grid grid-cols-3 gap-4 border-y border-ink py-6">
              {[
                [p.brewing_summary.temp, "вода"],
                [p.brewing_summary.grams, "на 100 мл"],
                [p.brewing_summary.steeps, p.brewing_summary.steeps_label],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col gap-2">
                  <span className="font-serif text-[clamp(30px,3.2vw,48px)] leading-none">{value}</span>
                  <span className="font-mono text-xs text-muted">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {p.attributes.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-[15px]">
              {p.attributes.map((a) => (
                <div key={a.key} className="contents">
                  <dt className="text-muted">{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      {p.images.length ? (
        <section className="container-site pt-3">
          <Gallery images={p.images} />
        </section>
      ) : null}

      {p.description || p.brewing ? (
        <section className="container-site grid gap-16 pt-[clamp(56px,7vw,100px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {p.description ? (
            <div className="flex flex-col gap-6">
              <h2 className="font-serif text-[clamp(28px,3vw,40px)]">О чае</h2>
              <RichText doc={p.description} />
            </div>
          ) : null}
          {p.brewing ? <Brewing brewing={p.brewing} /> : null}
        </section>
      ) : null}

      <Related title="В набор входят" items={p.set_contains} />
      <Related title="Подойдёт к этому чаю" items={p.goes_with} />
      <Related title={p.type === "tea" ? "Похожие чаи" : "Ещё в этом разделе"} items={p.similar} />
      <div className="pb-[clamp(80px,9vw,140px)]" />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(productJsonLd(p, PUBLIC_BASE_URL)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbsJsonLd(crumbs, PUBLIC_BASE_URL)) }} />
    </>
  );
}
