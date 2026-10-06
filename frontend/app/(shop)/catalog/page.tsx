import type { Metadata } from "next";

import { CatalogView } from "@/components/shop/catalog/CatalogView";
import { parseCatalogParams } from "@/lib/catalog-params";
import { loadCatalog } from "@/lib/catalog-server";
import { getCategories, PUBLIC_BASE_URL } from "@/lib/shop-server";

export async function generateMetadata(props: PageProps<"/catalog">): Promise<Metadata> {
  const params = parseCatalogParams(await props.searchParams);
  const filtered = Object.keys(await props.searchParams).length > 0;
  return {
    title: params.q ? `Поиск: ${params.q}` : "Каталог чая",
    description: "Пуэры, улуны, красные, белые, зелёные чаи, посуда и наборы. Любая граммовка, доставка по России.",
    alternates: { canonical: `${PUBLIC_BASE_URL}/catalog` },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CatalogPage(props: PageProps<"/catalog">) {
  const params = parseCatalogParams(await props.searchParams);
  const [data, categories] = await Promise.all([loadCatalog(params), getCategories()]);
  return (
    <CatalogView
      data={data}
      params={params}
      path="/catalog"
      categories={categories}
      current={null}
      title={params.q ? `Поиск: «${params.q}»` : "Чай"}
    />
  );
}
