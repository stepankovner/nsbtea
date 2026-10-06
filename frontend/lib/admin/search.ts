import { adminApi, must } from "./client";

export const adminSearch = (q: string) => must(adminApi.GET("/api/admin/search", { params: { query: { q } } }));
