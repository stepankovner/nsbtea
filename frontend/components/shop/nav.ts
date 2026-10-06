import type { Schemas } from "@/lib/api/client";

/** Разделы сайта для шапки и подвала. */
export function navItems(site: Schemas["SiteOut"]) {
  const items = [{ href: "/catalog", label: "Чай" }];
  if (site.thursday.active) items.push({ href: "/#chai-nedeli", label: `Чай недели −${site.thursday.percent}%` });
  items.push(
    { href: "/events", label: "Церемонии и сплавы" },
    { href: "/wholesale", label: "Оптовые заказы" },
    { href: "/about", label: "О магазине" },
  );
  return items;
}
