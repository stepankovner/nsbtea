/** Данные витрины для серверного рендера. `cache` — один запрос к API на страницу. */
import "server-only";

import { cache } from "react";

import { must } from "./api/client";
import { orNotFound, serverApi } from "./api/server";

export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const getSite = cache(async () => must((await serverApi()).GET("/api/site")));

export const getCategories = cache(async () => must((await serverApi()).GET("/api/catalog/categories")));

export const getProduct = cache(async (slug: string) =>
  orNotFound(must((await serverApi()).GET("/api/catalog/products/{slug}", { params: { path: { slug } } }))),
);

export const getPage = cache(async (slug: string) =>
  orNotFound(must((await serverApi()).GET("/api/pages/{slug}", { params: { path: { slug } } }))),
);

export const getEvent = cache(async (slug: string) =>
  orNotFound(must((await serverApi()).GET("/api/events/{slug}", { params: { path: { slug } } }))),
);

export const getCustomer = cache(async () => {
  const api = await serverApi();
  const { data, response } = await api.GET("/api/account/me");
  return response.ok && data ? data : null;
});
