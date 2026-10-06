export type PageKind = "page" | "guide" | "legal";

/** Адрес редактируемой страницы на сайте по её виду. */
export function pageHref(page: { slug: string; kind: string }): string {
  if (page.kind === "guide") return `/guides/${page.slug}`;
  if (page.kind === "legal") return `/legal/${page.slug}`;
  return `/${page.slug}`;
}
