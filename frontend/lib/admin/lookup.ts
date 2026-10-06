import { adminApi, must, type Schemas } from "./client";

export type LookupProduct = Schemas["LookupProduct"];

export function lookupProducts(params: { q?: string; ids?: string[]; limit?: number }): Promise<LookupProduct[]> {
  return must(
    adminApi.GET("/api/admin/lookup/products", {
      params: { query: { q: params.q, ids: params.ids?.length ? params.ids.join(",") : undefined, limit: params.limit } },
    }),
  );
}
