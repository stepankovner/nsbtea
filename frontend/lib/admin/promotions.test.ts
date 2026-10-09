import { describe, expect, it } from "vitest";

import { promoCode, promotion } from "@/components/admin/promotions/fixtures";

import {
  discountText,
  endToIso,
  isoToEnd,
  isoToMoscow,
  isValidPromoCode,
  moscowToday,
  moscowToIso,
  normalizePromoCode,
  periodText,
  promoCodeStatus,
  promotionStatus,
  thursdayPeriodText,
  usageText,
} from "./promotions";

describe("даты акций — по Москве, на сервер — UTC", () => {
  it("дата и время из полей → момент в UTC", () => {
    expect(moscowToIso("2026-10-10", "00:00")).toBe("2026-10-09T21:00:00.000Z");
    expect(moscowToIso("2026-10-10", "15:30")).toBe("2026-10-10T12:30:00.000Z");
    // время не указано — с начала дня
    expect(moscowToIso("2026-10-10", "")).toBe("2026-10-09T21:00:00.000Z");
    // дата не указана — без даты
    expect(moscowToIso("", "10:00")).toBeNull();
  });

  it("момент с сервера → поля по Москве", () => {
    expect(isoToMoscow("2026-10-09T21:00:00Z")).toEqual({ date: "2026-10-10", time: "00:00" });
    expect(isoToMoscow("2026-10-10T12:30:00Z")).toEqual({ date: "2026-10-10", time: "15:30" });
    expect(isoToMoscow(null)).toEqual({ date: "", time: "" });
  });

  it("окончание «в 23:59» — до конца этого дня включительно", () => {
    expect(endToIso("2026-10-20", "23:59")).toBe("2026-10-20T21:00:00.000Z");
    // время не указано — до конца дня
    expect(endToIso("2026-10-20", "")).toBe("2026-10-20T21:00:00.000Z");
    expect(endToIso("2026-12-31", "23:59")).toBe("2026-12-31T21:00:00.000Z");
    expect(endToIso("2026-10-20", "18:00")).toBe("2026-10-20T15:00:00.000Z");
    expect(endToIso("", "18:00")).toBeNull();
    expect(isoToEnd("2026-10-20T21:00:00Z")).toEqual({ date: "2026-10-20", time: "23:59" });
    expect(isoToEnd("2026-10-20T15:00:00Z")).toEqual({ date: "2026-10-20", time: "18:00" });
    expect(isoToEnd(null)).toEqual({ date: "", time: "" });
  });

  it("период словами", () => {
    expect(periodText(null, null)).toBe("Без срока");
    expect(periodText("2026-10-09T21:00:00Z", null)).toBe("с 10 октября 2026, 00:00");
    expect(periodText(null, "2026-10-20T21:00:00Z")).toBe("до 20 октября 2026, 23:59");
    expect(periodText("2026-10-09T21:00:00Z", "2026-10-20T21:00:00Z")).toBe("10 октября 2026, 00:00 — 20 октября 2026, 23:59");
  });

  it("«сегодня» — по московскому календарю", () => {
    expect(moscowToday(new Date("2026-10-07T21:30:00Z"))).toBe("2026-10-08");
    expect(moscowToday(new Date("2026-10-07T20:30:00Z"))).toBe("2026-10-07");
  });
});

describe("подписи акций", () => {
  it("скидка: процент или рубли", () => {
    expect(discountText(15, null)).toBe("−15%");
    expect(discountText(null, 15_000)).toBe("−150 ₽");
  });

  it("использование: сколько раз и на какую сумму", () => {
    expect(usageText({ uses: 0, discount_kop: 0 })).toBe("Пока не применяли");
    expect(usageText({ uses: 1, discount_kop: 30_000 })).toBe("1 раз, скидка 300 ₽");
    expect(usageText({ uses: 12, discount_kop: 340_000 })).toBe("12 раз, скидка 3 400 ₽");
    expect(usageText({ uses: 3, discount_kop: 90_000 })).toBe("3 раза, скидка 900 ₽");
  });

  it("статус акции — словом и цветом", () => {
    expect(promotionStatus(promotion())).toEqual({ label: "Идёт", tone: "success" });
    expect(promotionStatus(promotion({ status_label: "Запланирована" }))).toEqual({ label: "Запланирована", tone: "info" });
    expect(promotionStatus(promotion({ status_label: "Закончилась" }))).toEqual({ label: "Закончилась", tone: "neutral" });
    expect(promotionStatus(promotion({ status_label: "Выключена", is_active: false }))).toEqual({ label: "Выключена", tone: "warning" });
  });

  it("статус промокода — с учётом дат и лимита", () => {
    const now = new Date("2026-10-08T09:00:00Z");
    expect(promoCodeStatus(promoCode(), now)).toEqual({ label: "Действует", tone: "success" });
    expect(promoCodeStatus(promoCode({ is_active: false }), now)).toEqual({ label: "Выключен", tone: "warning" });
    expect(promoCodeStatus(promoCode({ starts_at: "2026-10-10T21:00:00Z" }), now)).toEqual({ label: "Запланирован", tone: "info" });
    expect(promoCodeStatus(promoCode({ ends_at: "2026-10-01T21:00:00Z" }), now)).toEqual({ label: "Закончился", tone: "neutral" });
    expect(promoCodeStatus(promoCode({ max_uses: 5, stats: { uses: 5, discount_kop: 10_000 } }), now)).toEqual({ label: "Лимит исчерпан", tone: "neutral" });
  });

  it("в архиве — так и пишем, а не «выключена»", () => {
    expect(promotionStatus(promotion({ archived: true, is_active: false, status_label: "Выключена" }))).toEqual({ label: "В архиве", tone: "neutral" });
    expect(promoCodeStatus(promoCode({ archived: true, is_active: false }))).toEqual({ label: "В архиве", tone: "neutral" });
  });

  it("срок чая недели: неделя или один день", () => {
    expect(thursdayPeriodText("2026-10-08", "week")).toBe("с 8 по 14 октября");
    expect(thursdayPeriodText("2026-10-29", "week")).toBe("с 29 октября по 4 ноября");
    expect(thursdayPeriodText("2026-10-08", "day")).toBe("только 8 октября, с 00:00 до 23:59");
  });

  it("промокод: латинские буквы, цифры, дефис и подчёркивание — как на сервере", () => {
    expect(normalizePromoCode(" chai-10 ")).toBe("CHAI-10");
    expect(isValidPromoCode("CHAI10")).toBe(true);
    expect(isValidPromoCode("OSEN_2026")).toBe(true);
    expect(isValidPromoCode("ЧАЙ10")).toBe(false);
    expect(isValidPromoCode("AB")).toBe(false);
    expect(isValidPromoCode("CHAI 10")).toBe(false);
  });
});
