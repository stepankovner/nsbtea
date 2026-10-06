import { describe, expect, it } from "vitest";

import { catalogHref, parseCatalogParams } from "./catalog-params";

describe("parseCatalogParams — адрес страницы каталога → запрос к API", () => {
  it("значения по умолчанию", () => {
    expect(parseCatalogParams({})).toEqual({ sort: "popular", page: 1, in_stock: false, tags: [] });
  });

  it("фильтры и сортировка", () => {
    expect(
      parseCatalogParams({
        q: "  шу  ",
        sort: "price_asc",
        page: "2",
        in_stock: "1",
        tags: "orehi,med",
        effect: "calming",
        region: "Юньнань",
        shape: "cake",
        price_min: "500",
        price_max: "1200",
      }),
    ).toEqual({
      q: "шу",
      sort: "price_asc",
      page: 2,
      in_stock: true,
      tags: ["orehi", "med"],
      effect: "calming",
      region: "Юньнань",
      shape: "cake",
      price_min: 500,
      price_max: 1200,
    });
  });

  it("мусор в адресе не ломает каталог", () => {
    expect(parseCatalogParams({ sort: "hack", page: "-5", price_min: "abc", tags: ["a", "b"] })).toEqual({
      sort: "popular",
      page: 1,
      in_stock: false,
      tags: ["a"],
    });
  });
});

describe("catalogHref — адрес с изменённым фильтром", () => {
  const base = parseCatalogParams({ sort: "new", tags: "orehi", page: "3" });

  it("смена фильтра сбрасывает страницу", () => {
    expect(catalogHref("/catalog/ulun", base, { tags: ["orehi", "med"] })).toBe(
      "/catalog/ulun?sort=new&tags=orehi%2Cmed",
    );
  });

  it("сортировка по умолчанию и пустые значения не пишутся", () => {
    expect(catalogHref("/catalog", base, { sort: "popular", tags: [] })).toBe("/catalog");
  });

  it("переход на страницу сохраняет фильтры", () => {
    expect(catalogHref("/catalog", base, { page: 4 })).toBe("/catalog?sort=new&tags=orehi&page=4");
  });
});
