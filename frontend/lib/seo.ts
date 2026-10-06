/** Разметка schema.org (JSON-LD) для поисковиков: товар, хлебные крошки, магазин, событие. */
import type { Schemas } from "./api/client";

const SCHEMA = "https://schema.org";

const abs = (base: string, path: string) => (/^https?:\/\//.test(path) ? path : `${base.replace(/\/$/, "")}${path}`);
const rub = (kop: number) => (kop / 100).toFixed(2);

export function productJsonLd(product: Schemas["ProductPage"], base: string): Record<string, unknown> {
  const images = product.images.length
    ? product.images.map((i) => abs(base, i.url))
    : product.image
      ? [abs(base, product.image.url)]
      : [];
  return {
    "@context": SCHEMA,
    "@type": "Product",
    name: product.name,
    description: product.short_description ?? product.seo.description,
    image: images,
    sku: product.slug,
    brand: { "@type": "Brand", name: "НСБ Чай" },
    ...(product.category ? { category: product.category.name } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "RUB",
      price: rub(product.price_kop),
      availability: product.in_stock ? `${SCHEMA}/InStock` : `${SCHEMA}/OutOfStock`,
      url: abs(base, `/product/${product.slug}`),
      ...(product.price_grams ? { eligibleQuantity: { "@type": "QuantitativeValue", value: product.price_grams, unitCode: "GRM" } } : {}),
    },
  };
}

export function breadcrumbsJsonLd(crumbs: { name: string; href: string }[], base: string) {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: abs(base, c.href),
    })),
  };
}

export function organizationJsonLd(site: Schemas["SiteOut"], base: string) {
  const s = site.store;
  const sameAs = [s.telegram_url, s.telegram_channel_url, s.vk_url].filter((u) => /^https?:\/\//.test(u));
  return {
    "@context": SCHEMA,
    "@type": "Organization",
    name: s.shop_name || "НСБ Чай",
    url: base.replace(/\/$/, ""),
    logo: abs(base, "/icon.png"),
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(s.address ? { address: { "@type": "PostalAddress", addressLocality: "Владимир", streetAddress: s.address } } : {}),
    sameAs,
  };
}

type EventLike = Pick<
  Schemas["EventOut"],
  "slug" | "title" | "starts_at" | "ends_at" | "place" | "price_kop" | "short_description" | "cover" | "seats_left"
>;

export function eventJsonLd(event: EventLike, base: string) {
  return {
    "@context": SCHEMA,
    "@type": "Event",
    name: event.title,
    startDate: event.starts_at,
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
    eventStatus: `${SCHEMA}/EventScheduled`,
    ...(event.place ? { location: { "@type": "Place", name: event.place, address: event.place } } : {}),
    ...(event.short_description ? { description: event.short_description } : {}),
    ...(event.cover ? { image: [abs(base, event.cover.url)] } : {}),
    ...(event.price_kop !== null
      ? {
          offers: {
            "@type": "Offer",
            price: rub(event.price_kop),
            priceCurrency: "RUB",
            availability: event.seats_left === 0 ? `${SCHEMA}/SoldOut` : `${SCHEMA}/InStock`,
            url: abs(base, `/events/${event.slug}`),
          },
        }
      : {}),
    organizer: { "@type": "Organization", name: "НСБ Чай", url: base },
    url: abs(base, `/events/${event.slug}`),
  };
}

/** JSON для <script type="application/ld+json">: экранируем «<», чтобы текст не закрыл тег. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
