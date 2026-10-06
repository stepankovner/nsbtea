import "server-only";

import { must, type Schemas } from "./api/client";
import { orNotFound, serverApi } from "./api/server";
import { catalogQuery, type CatalogParams } from "./catalog-params";

export async function loadCatalog(params: CatalogParams, category?: string): Promise<Schemas["CatalogPage"]> {
  const api = await serverApi();
  return orNotFound(must(api.GET("/api/catalog/products", { params: { query: catalogQuery(params, category) } })));
}

export function findCategory(tree: Schemas["PublicCategory"][], slug: string): Schemas["PublicCategory"] | null {
  for (const c of tree) {
    if (c.slug === slug) return c;
    const child = findCategory(c.children, slug);
    if (child) return child;
  }
  return null;
}
