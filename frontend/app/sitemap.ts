import type { MetadataRoute } from "next";

import { createApi, must } from "@/lib/api/client";
import { pageHref } from "@/lib/pages";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const BASE = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const api = createApi({
  baseUrl: process.env.API_INTERNAL_URL ?? "http://localhost:8000",
  fetch: (request) => fetch(request, { cache: "no-store" }),
});

async function allProducts() {
  const items: { slug: string }[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await must(api.GET("/api/catalog/products", { params: { query: { page, per_page: 100 } } }));
    items.push(...data.items);
    if (items.length >= data.total || !data.items.length) break;
  }
  return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, pages, events] = await Promise.all([
    allProducts(),
    must(api.GET("/api/catalog/categories")),
    must(api.GET("/api/pages")),
    must(api.GET("/api/events")),
  ]);
  const flat = categories.flatMap((c) => [c, ...c.children]);
  return [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/events`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/guides`, changeFrequency: "monthly", priority: 0.5 },
    ...flat.map((c) => ({ url: `${BASE}/catalog/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${BASE}/product/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...pages.map((p) => ({ url: `${BASE}${pageHref(p)}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    ...events.map((e) => ({ url: `${BASE}/events/${e.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
