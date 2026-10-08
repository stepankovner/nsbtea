import { describe, expect, it } from "vitest";

import * as health from "./route";

describe("/healthz — проверка, что сайт жив (Docker, мониторинг)", () => {
  it("отвечает 200 без обращения к backend и не кешируется", async () => {
    const response = health.GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(health.dynamic).toBe("force-dynamic");
  });
});
