/** Разделы сайта для шапки и подвала. */
export function navItems() {
  const items = [{ href: "/catalog", label: "Чай" }];
  items.push(
    { href: "/events", label: "Церемонии и сплавы" },
    { href: "/wholesale", label: "Оптовые заказы" },
    { href: "/about", label: "О магазине" },
  );
  return items;
}
