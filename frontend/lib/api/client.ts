/**
 * Типизированный клиент API (типы — из OpenAPI backend, см. `pnpm gen:api`).
 *
 * В браузере запросы идут на тот же домен (/api), cookie сессии подставляются сами.
 * При серверном рендере — напрямую в backend (API_INTERNAL_URL) с пробросом cookie.
 */
import createClient, { type Client } from "openapi-fetch";

import { toApiError } from "./errors";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Api = Client<paths>;

export const CSRF_HEADER = "X-CSRF-Token";

export interface ApiOptions {
  baseUrl?: string;
  fetch?: (input: Request) => Promise<Response>;
  headers?: Record<string, string>;
  /** токен CSRF админки — добавляется ко всем изменяющим запросам */
  csrf?: () => string | null;
}

export function createApi(options: ApiOptions = {}): Api {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? "",
    fetch: options.fetch,
    headers: options.headers,
    credentials: "same-origin",
  });
  const csrf = options.csrf;
  if (csrf) {
    client.use({
      onRequest({ request }) {
        const token = csrf();
        if (token && request.method !== "GET" && request.method !== "HEAD") {
          request.headers.set(CSRF_HEADER, token);
        }
        return request;
      },
    });
  }
  return client;
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Дождаться ответа и вернуть данные; при ошибке — бросить ApiError с понятным текстом. */
export async function must<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await promise;
  if (!response.ok) throw toApiError(response.status, error);
  return data as T;
}

/** Клиент для браузера (витрина и кабинет). */
export const browserApi: Api = createApi();
