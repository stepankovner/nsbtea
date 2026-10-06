/**
 * API при серверном рендере: запросы идут напрямую в backend, cookie и IP посетителя
 * пробрасываются (кабинет, корзина, ограничения частоты запросов).
 */
import "server-only";

import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

import { createApi, type Api } from "./client";
import { ApiError } from "./errors";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";
const FORWARDED = ["cookie", "x-forwarded-for", "x-real-ip", "user-agent"] as const;

export async function serverApi(): Promise<Api> {
  const incoming = await headers();
  const forward: Record<string, string> = {};
  for (const name of FORWARDED) {
    const value = incoming.get(name);
    if (value) forward[name] = value;
  }
  return createApi({
    baseUrl: API_URL,
    headers: forward,
    fetch: (request) => fetch(request, { cache: "no-store" }),
  });
}

/** 404 → страница «не найдено», «moved» → постоянный редирект на новый адрес (смена ЧПУ). */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      const location = error.extra.location;
      if (error.code === "moved" && typeof location === "string") permanentRedirect(location);
      if (error.status === 404) notFound();
    }
    throw error;
  }
}
