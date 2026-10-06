import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogView } from "@/components/shop/catalog/CatalogView";
import { parseCatalogParams } from "@/lib/catalog-params";
import { findCategory, loadCatalog } from "@/lib/catalog-server";
import { breadcrumbsJsonLd, jsonLdString } from "@/lib/seo";
import { getCategories, PUBLIC_BASE_URL } from "@/lib/shop-server";

export async function generateMetadata(props: PageProps<"/catalog/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const category = findCategory(await getCategories(), slug);
  if (!category) return {};
  const filtered = Object.keys(await props.searchParams).length > 0;
  return {
    title: category.seo_title || category.name,
    description: category.seo_description || category.description || `${category.name} — купить в интернет-магазине НСБ Чай`,
    alternates: { canonical: `${PUBLIC_BASE_URL}/catalog/${category.slug}` },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: category.name,
      images: category.cover ? [{ url: category.cover.url }] : [{ url: "/og-default.png" }],
    },
  };
}

export default async function CategoryPage(props: PageProps<"/catalog/[slug]">) {
  const { slug } = await props.params;
  const params = parseCatalogParams(await props.searchParams);
  // loadCatalog сам сделает 301, если у категории сменился адрес
  const [data, categories] = await Promise.all([loadCatalog(params, slug), getCategories()]);
  const current = data.category ? (findCategory(categories, data.category.slug) ?? data.category) : findCategory(categories, slug);
  if (!current) notFound();
  return (
    <>
      <CatalogView
        data={data}
        params={params}
        path={`/catalog/${current.slug}`}
        categories={categories}
        current={current}
        title={current.name}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbsJsonLd(
              [
                { name: "Каталог", href: "/catalog" },
                { name: current.name, href: `/catalog/${current.slug}` },
              ],
              PUBLIC_BASE_URL,
            ),
          ),
        }}
      />
    </>
  );
}
