import { describe, expect, it, vi } from "vitest";

import { createApi, must } from "./client";
import { ApiError } from "./errors";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("must — ответ API или понятная ошибка", () => {
  it("возвращает данные", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: "ok", database: "ok" }));
    const api = createApi({ baseUrl: "https://shop.test", fetch: fetchMock });
    await expect(must(api.GET("/api/health"))).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("бросает ApiError с текстом сервера", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "Товар не найден или снят с продажи", code: "not_found" }, 404),
    );
    const api = createApi({ baseUrl: "https://shop.test", fetch: fetchMock });
    const promise = must(api.GET("/api/catalog/products/{slug}", { params: { path: { slug: "x" } } }));
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("пустой ответ 204 — undefined", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const api = createApi({ baseUrl: "https://shop.test", fetch: fetchMock });
    await expect(must(api.POST("/api/auth/logout"))).resolves.toBeUndefined();
  });
});

describe("заголовки", () => {
  it("CSRF-токен добавляется к изменяющим запросам, но не к чтению", async () => {
    const seen: Request[] = [];
    const fetchMock = vi.fn(async (input: Request) => {
      seen.push(input);
      return jsonResponse({ ok: true });
    });
    const api = createApi({ baseUrl: "https://shop.test", fetch: fetchMock, csrf: () => "tok-123" });
    await api.GET("/api/admin/auth/me");
    await api.POST("/api/admin/auth/logout");
    expect(seen[0]?.headers.get("X-CSRF-Token")).toBeNull();
    expect(seen[1]?.headers.get("X-CSRF-Token")).toBe("tok-123");
  });

  it("дополнительные заголовки (cookie при серверном рендере)", async () => {
    const seen: Request[] = [];
    const fetchMock = vi.fn(async (input: Request) => {
      seen.push(input);
      return jsonResponse({ ok: true });
    });
    const api = createApi({
      baseUrl: "http://api:8000",
      fetch: fetchMock,
      headers: { cookie: "nsb_session=abc", "x-forwarded-for": "1.2.3.4" },
    });
    await api.GET("/api/account/me");
    expect(seen[0]?.url).toBe("http://api:8000/api/account/me");
    expect(seen[0]?.headers.get("cookie")).toBe("nsb_session=abc");
    expect(seen[0]?.headers.get("x-forwarded-for")).toBe("1.2.3.4");
  });
});
