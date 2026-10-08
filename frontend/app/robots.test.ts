import { afterEach, describe, expect, it, vi } from "vitest";

import robots, * as robotsModule from "./robots";

describe("robots.txt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("адрес сайта берётся при запросе, а не при сборке: один образ — и тестовый, и боевой сервер", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "https://nsbtea.ru");
    const production = robots();
    expect(production.rules).toEqual(expect.objectContaining({ userAgent: "*", allow: "/" }));
    expect(production.sitemap).toBe("https://nsbtea.ru/sitemap.xml");

    vi.stubEnv("PUBLIC_BASE_URL", "https://staging.nsbtea.ru/");
    const staging = robots();
    expect(staging.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(staging.sitemap).toBe("https://staging.nsbtea.ru/sitemap.xml");
  });

  it("не сохраняется при сборке", () => {
    expect(robotsModule.dynamic).toBe("force-dynamic");
  });
});
