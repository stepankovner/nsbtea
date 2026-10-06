import type { MetadataRoute } from "next";

const BASE = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  const production = BASE.startsWith("https://nsbtea.ru");
  return {
    // тестовый сервер закрыт от поисковиков целиком
    rules: production
      ? { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/order", "/api/", "/*?*sort=", "/*?*tags="] }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
