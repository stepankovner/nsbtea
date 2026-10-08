import { describe, expect, it } from "vitest";

import { adminProduct, unitProduct } from "@/components/admin/products/fixtures";

import {
  clientErrors,
  emptyBrewMethod,
  formFromProduct,
  packPriceKop,
  pricePerGramFromInput,
  problemSteps,
  problemsInMessage,
  productPatch,
  weightOptionsPreview,
} from "./products";

describe("цена весового чая — так же, как считает сервер (SPEC 3.3)", () => {
  it("цена «за 50 г» или «за 100 г» → копейки за грамм, округление half-up", () => {
    expect(pricePerGramFromInput(60_000, 50)).toBe(1200);
    expect(pricePerGramFromInput(33_325, 50)).toBe(667); // 666,5 → 667
    expect(pricePerGramFromInput(33_324, 50)).toBe(666);
    expect(pricePerGramFromInput(120_000, 100)).toBe(1200);
    expect(pricePerGramFromInput(1200, 1)).toBe(1200);
    // совсем маленькая цена не превращается в ноль
    expect(pricePerGramFromInput(1, 100)).toBe(1);
  });

  it("цена фасовки = граммы × цена за грамм, до целого рубля half-up", () => {
    expect(packPriceKop(50, 1200)).toBe(60_000);
    expect(packPriceKop(25, 1234)).toBe(30_900); // 308,50 ₽ → 309 ₽
    expect(packPriceKop(25, 1233)).toBe(30_800); // 308,25 ₽ → 308 ₽
    expect(packPriceKop(357, 1200)).toBe(428_400);
  });

  it("варианты веса для предпросмотра: граммовки по возрастанию и весь блин", () => {
    const form = {
      ...formFromProduct(adminProduct({ weight_presets: [100, 25, 50] })),
      cake_enabled: true,
      cake_weight_grams: 357,
      cake_price_kop: null,
    };
    expect(weightOptionsPreview(form).map((o) => [o.kind, o.grams, o.price_kop])).toEqual([
      ["preset", 25, 30_000],
      ["preset", 50, 60_000],
      ["preset", 100, 120_000],
      ["cake", 357, 428_400],
    ]);
    // своя цена блина важнее расчёта по граммам
    expect(weightOptionsPreview({ ...form, cake_price_kop: 400_000 }).at(-1)?.price_kop).toBe(400_000);
    // без цены показывать нечего
    expect(weightOptionsPreview({ ...form, price_kop: null })).toEqual([]);
  });
});

describe("форма товара ↔ сервер", () => {
  it("цена показывается так, как её вводили: за 50 г", () => {
    const form = formFromProduct(adminProduct({ price_per_gram_kop: 1200, price_input_base: 50 }));
    expect(form.price_kop).toBe(60_000);
    expect(form.price_base).toBe(50);
    expect(formFromProduct(adminProduct({ price_per_gram_kop: 1200, price_input_base: 100 })).price_kop).toBe(120_000);
  });

  it("в сохранение уходят только изменённые поля", () => {
    const base = formFromProduct(adminProduct());
    expect(productPatch(base, base)).toEqual({});
    expect(productPatch({ ...base, short_description: "  Новый текст " }, base)).toEqual({ short_description: "Новый текст" });
    expect(productPatch({ ...base, price_kop: 70_000 }, base)).toEqual({ price: { amount_kop: 70_000, per_grams: 50 } });
    expect(productPatch({ ...base, price_base: 100, price_kop: 140_000 }, base)).toEqual({
      price: { amount_kop: 140_000, per_grams: 100 },
    });
    expect(productPatch({ ...base, weight_presets: [100, 25] }, base)).toEqual({ weight_presets: [25, 100] });
    expect(productPatch({ ...base, hanzi: "" }, base)).toEqual({ hanzi: null });
    expect(productPatch({ ...base, category_id: null }, base)).toEqual({ category_id: null });
    expect(productPatch({ ...base, low_stock_threshold: 100 }, base)).toEqual({ low_stock_threshold: 100 });
  });

  it("весь блин: выключили — вес и цена блина очищаются", () => {
    const base = formFromProduct(adminProduct({ cake_weight_grams: 357, cake_price_kop: 400_000 }));
    expect(base.cake_enabled).toBe(true);
    expect(productPatch({ ...base, cake_enabled: false }, base)).toEqual({ cake_weight_grams: null, cake_price_kop: null });
  });

  it("свой вес: включатель, минимум и шаг", () => {
    const base = formFromProduct(adminProduct());
    expect(productPatch({ ...base, custom_weight_enabled: true, custom_weight_min: 20 }, base)).toEqual({
      custom_weight_enabled: true,
      custom_weight_min: 20,
    });
  });

  it("характеристики уходят целиком, пустые не отправляются", () => {
    const base = formFromProduct(adminProduct({ attributes: { region: "Уишань" } }));
    expect(base.attributes.region).toBe("Уишань");
    const next = { ...base, attributes: { ...base.attributes, harvest_year: 2023, shape: "loose" as const, factory: " " } };
    expect(productPatch(next, base)).toEqual({ attributes: { region: "Уишань", harvest_year: 2023, shape: "loose" } });
  });

  it("заварка: включённые способы и комментарий мастера", () => {
    const base = formFromProduct(adminProduct());
    const next = {
      ...base,
      brewing_methods: [{ ...emptyBrewMethod("gongfu"), grams: 7, volume_ml: 120, temp_c: 95, steeps: 8 }],
      master_note: "Не передерживайте первые проливы",
    };
    expect(productPatch(next, base)).toEqual({
      brewing: {
        methods: [{ method: "gongfu", grams: 7, volume_ml: 120, temp_c: 95, steeps: 8 }],
        master_note: "Не передерживайте первые проливы",
      },
    });
    // и обратно: что пришло с сервера — то в форме
    const loaded = formFromProduct(adminProduct({ brewing: productPatch(next, base).brewing as Record<string, unknown> }));
    expect(loaded.brewing_methods[0]).toMatchObject({ method: "gongfu", temp_c: 95, vessel: "" });
    expect(loaded.master_note).toBe("Не передерживайте первые проливы");
  });

  it("вкусовые ноты и слова для поиска — списком", () => {
    const base = formFromProduct(adminProduct());
    expect(base.flavor_tags).toEqual(["шоколад"]);
    expect(productPatch({ ...base, flavor_tags: ["шоколад", "чернослив"], search_aliases: ["дахунпао"] }, base)).toEqual({
      flavor_tags: ["шоколад", "чернослив"],
      search_aliases: ["дахунпао"],
    });
  });

  it("штучный товар — цена за штуку и вес посылки", () => {
    const base = formFromProduct(unitProduct());
    expect(base.unit_price_kop).toBe(250_000);
    expect(productPatch({ ...base, unit_price_kop: 300_000, weight_grams: 350 }, base)).toEqual({
      unit_price_kop: 300_000,
      weight_grams: 350,
    });
  });

  it("проверки до отправки: название, минимум кратен шагу, вес блина, адрес", () => {
    const base = formFromProduct(adminProduct());
    expect(clientErrors(base)).toEqual({});
    expect(clientErrors({ ...base, name: "  " })).toHaveProperty("name");
    expect(clientErrors({ ...base, custom_weight_enabled: true, custom_weight_min: 12, custom_weight_step: 5 })).toHaveProperty(
      "custom_weight_min",
    );
    expect(clientErrors({ ...base, cake_enabled: true, cake_weight_grams: null })).toHaveProperty("cake_weight_grams");
    expect(clientErrors({ ...base, slug: "Да хун пао" })).toHaveProperty("slug");
    expect(clientErrors({ ...base, slug: "da-hun-pao-2023" })).toEqual({});
  });
});

describe("чего не хватает для публикации → где поправить", () => {
  it("каждой нехватке — свой шаг мастера", () => {
    expect(problemSteps(["цену", "категорию"], "tea")).toEqual([
      { problem: "цену", step: 4, title: "Цена и граммовки" },
      { problem: "категорию", step: 1, title: "Тип и категория" },
    ]);
    expect(problemSteps(["цену"], "unit")).toEqual([{ problem: "цену", step: 4, title: "Цена" }]);
  });

  it("список нехваток достаём из текста ошибки сервера", () => {
    expect(problemsInMessage("Чтобы показать товар на сайте, заполните: цену, хотя бы один вариант веса")).toEqual([
      "цену",
      "хотя бы один вариант веса",
    ]);
    expect(problemsInMessage("Товар в архиве — сначала восстановите его")).toEqual([]);
  });
});
