import { describe, expect, it } from "vitest";

import { srcSetOf } from "./media";

describe("srcSetOf — WebP-варианты от backend", () => {
  it("строит srcset по ширинам, по возрастанию", () => {
    expect(
      srcSetOf({
        "1024": "/media/a/1024.webp",
        "320": "/media/a/320.webp",
        original: "/media/a/original.webp",
        "640": "/media/a/640.webp",
      }),
    ).toBe("/media/a/320.webp 320w, /media/a/640.webp 640w, /media/a/1024.webp 1024w");
  });
  it("пусто — undefined", () => {
    expect(srcSetOf({})).toBeUndefined();
    expect(srcSetOf(undefined)).toBeUndefined();
  });
});
