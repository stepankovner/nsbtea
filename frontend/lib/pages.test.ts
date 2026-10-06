import { describe, expect, it } from "vitest";

import { pageHref } from "./pages";

describe("pageHref — адреса редактируемых страниц", () => {
  it("обычная страница в корне", () => {
    expect(pageHref({ slug: "about", kind: "page" })).toBe("/about");
  });
  it("гайды по завариванию", () => {
    expect(pageHref({ slug: "gongfu", kind: "guide" })).toBe("/guides/gongfu");
  });
  it("юридические документы", () => {
    expect(pageHref({ slug: "offer", kind: "legal" })).toBe("/legal/offer");
  });
});
