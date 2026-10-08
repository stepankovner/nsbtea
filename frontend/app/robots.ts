import type { MetadataRoute } from "next";

// Адрес сайта читается при каждом запросе: один и тот же образ работает и на тестовом сервере
// (закрыт от поисковиков), и на боевом.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const production = base.startsWith("https://nsbtea.ru");
  return {
    // тестовый сервер закрыт от поисковиков целиком
    rules: production
      ? { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/order", "/api/", "/*?*sort=", "/*?*tags="] }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
