import { describe, expect, it } from "vitest";

import { checkQty, parseIds, qtyFromLabel, signedQty } from "@/lib/admin/inventory";

const NBSP = "\u00a0";
/** подписи — с неразрывными пробелами, как на сервере; в тестах сравниваем с обычными */
const plain = (text: string | null) => text?.replace(/\u00a0/g, " ") ?? null;

describe("checkQty — проверка введённого количества", () => {
  it("целые граммы и штуки проходят; пробелы между разрядами не мешают", () => {
    expect(checkQty("500", "tea", "supply")).toEqual({ value: 500, error: null });
    expect(checkQty(" 1 000 ", "tea", "supply")).toEqual({ value: 1000, error: null });
    expect(checkQty(`1${NBSP}200`, "tea", "supply")).toEqual({ value: 1200, error: null });
    expect(checkQty("3", "unit", "supply")).toEqual({ value: 3, error: null });
  });

  it("дроби — нельзя: вес только в целых граммах, штуки — целые", () => {
    expect(checkQty("2,5", "tea", "supply").error).toMatch(/Только целые граммы/);
    expect(checkQty("0.5", "tea", "count").error).toMatch(/Только целые граммы/);
    expect(checkQty("1.5", "unit", "supply").error).toMatch(/Только целое число штук/);
  });

  it("буквы и минус — понятная подсказка", () => {
    expect(plain(checkQty("2кг", "tea", "supply").error)).toMatch(/цифрами.*1 кг = 1000 г/);
    expect(checkQty("три", "unit", "supply").error).toMatch(/цифрами/);
    expect(checkQty("-5", "tea", "count").error).toMatch(/без минуса/);
  });

  it("пустое поле — своя подсказка для каждого действия", () => {
    expect(checkQty("", "tea", "supply").error).toBe("Укажите, сколько пришло");
    expect(checkQty("  ", "tea", "count").error).toBe("Укажите, сколько есть на самом деле");
    expect(checkQty("", "unit", "writeoff").error).toBe("Укажите, сколько списать");
  });

  it("поставка и списание — больше нуля; инвентаризация — ноль можно (товар закончился)", () => {
    expect(checkQty("0", "tea", "supply").error).toMatch(/больше нуля/);
    expect(checkQty("0", "tea", "writeoff", 150).error).toMatch(/больше нуля/);
    expect(checkQty("0", "tea", "count")).toEqual({ value: 0, error: null });
  });

  it("слишком большие числа — просим проверить", () => {
    expect(checkQty("1000000", "tea", "supply")).toEqual({ value: 1_000_000, error: null });
    expect(checkQty("1000001", "tea", "supply").error).toMatch(/Слишком много для одной поставки/);
    expect(checkQty("99999999999999999999", "tea", "count").error).toMatch(/Слишком большое число/);
  });

  it("списать больше, чем на складе, нельзя — текст как у сервера", () => {
    expect(plain(checkQty("200", "tea", "writeoff", 150).error)).toBe("Нельзя списать 200 г: на складе 150 г");
    expect(plain(checkQty("3", "unit", "writeoff", 2).error)).toBe("Нельзя списать 3 шт.: на складе 2 шт.");
    expect(checkQty("150", "tea", "writeoff", 150)).toEqual({ value: 150, error: null });
  });
});

describe("signedQty — изменение со знаком", () => {
  it("плюс, минус и «без изменений»", () => {
    expect(plain(signedQty("tea", 500))).toBe("+500 г");
    expect(plain(signedQty("tea", -1500))).toBe("−1 500 г");
    expect(plain(signedQty("unit", 2))).toBe("+2 шт.");
    expect(signedQty("unit", 0)).toBe("без изменений");
  });
});

describe("parseIds — товары из адреса (?products=id1,id2)", () => {
  it("убирает пустые и повторы, сохраняет порядок", () => {
    expect(parseIds("p1, p2,,p1")).toEqual(["p1", "p2"]);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds("")).toEqual([]);
  });
});

describe("qtyFromLabel — число из подписи остатка («1 200 г»)", () => {
  it("достаёт целое число", () => {
    expect(qtyFromLabel(`1${NBSP}200 г`)).toBe(1200);
    expect(qtyFromLabel("6 шт.")).toBe(6);
    expect(qtyFromLabel("0 г")).toBe(0);
    expect(qtyFromLabel("")).toBeNull();
  });
});
