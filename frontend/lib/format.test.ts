import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatGrams,
  formatPhone,
  formatQty,
  formatRub,
  kopToRubInput,
  plural,
  rubToKop,
} from "./format";

const NBSP = " ";

describe("formatRub — как на сервере: неразрывные пробелы, копейки только если есть", () => {
  it.each([
    [0, `0${NBSP}₽`],
    [100, `1${NBSP}₽`],
    [120_000, `1${NBSP}200${NBSP}₽`],
    [12_350, `123,50${NBSP}₽`],
    [123_456_789, `1${NBSP}234${NBSP}567,89${NBSP}₽`],
    [-5_000, `−50${NBSP}₽`],
    [7, `0,07${NBSP}₽`],
  ])("%i коп. → %s", (kop, text) => {
    expect(formatRub(kop)).toBe(text);
  });
});

describe("rubToKop — ввод цены в рублях в админке", () => {
  it.each([
    ["1200", 120_000],
    ["1 200", 120_000],
    [`1${NBSP}200`, 120_000],
    ["12,5", 1_250],
    ["12.50", 1_250],
    ["0,07", 7],
    [" 28 ", 2_800],
    ["0", 0],
  ])("«%s» → %i коп.", (input, kop) => {
    expect(rubToKop(input)).toBe(kop);
  });

  it.each(["", "abc", "12,345", "-5", "1.2.3", "12р"])("«%s» — не цена", (input) => {
    expect(rubToKop(input)).toBeNull();
  });

  it("обратное преобразование для поля ввода", () => {
    expect(kopToRubInput(120_000)).toBe("1200");
    expect(kopToRubInput(1_250)).toBe("12,50");
    expect(kopToRubInput(null)).toBe("");
  });
});

describe("plural", () => {
  it.each([
    [1, "балл"],
    [2, "балла"],
    [5, "баллов"],
    [11, "баллов"],
    [21, "балл"],
    [22, "балла"],
    [112, "баллов"],
    [0, "баллов"],
  ])("%i %s", (n, word) => {
    expect(plural(n, "балл", "балла", "баллов")).toBe(word);
  });
});

describe("вес и количество", () => {
  it("граммы с разделителем тысяч", () => {
    expect(formatGrams(50)).toBe(`50${NBSP}г`);
    expect(formatGrams(1500)).toBe(`1${NBSP}500${NBSP}г`);
  });
  it("штуки и граммы по типу товара", () => {
    expect(formatQty("tea", 250)).toBe(`250${NBSP}г`);
    expect(formatQty("unit", 3)).toBe(`3${NBSP}шт.`);
  });
});

describe("даты показываются по Москве", () => {
  it("дата", () => {
    // 22:30 UTC 7 октября = 01:30 МСК 8 октября
    expect(formatDate("2026-10-07T22:30:00Z")).toBe("8 октября 2026");
  });
  it("дата и время", () => {
    expect(formatDateTime("2026-10-05T09:00:00Z")).toBe("5 октября 2026, 12:00");
  });
});

describe("formatPhone", () => {
  it("российский номер", () => {
    expect(formatPhone("+79001234567")).toBe("+7 900 123-45-67");
  });
  it("другое оставляет как есть", () => {
    expect(formatPhone("12345")).toBe("12345");
    expect(formatPhone(null)).toBe("");
  });
});
