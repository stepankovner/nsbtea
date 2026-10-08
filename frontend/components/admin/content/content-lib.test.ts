import { describe, expect, it } from "vitest";

import { BLOCK_SCHEMAS, eventPreview, fromMoscow, pagePath, slugError, slugify, toMoscow } from "@/lib/admin/content";

describe("время событий — вводим и показываем по Москве, на сервер — UTC", () => {
  it("дата и время по Москве → момент в UTC", () => {
    expect(fromMoscow("2026-10-15", "19:00")).toBe("2026-10-15T16:00:00.000Z");
    // после полуночи по Москве — ещё вчера по UTC
    expect(fromMoscow("2026-01-01", "00:30")).toBe("2025-12-31T21:30:00.000Z");
  });

  it("без даты или времени — нет значения", () => {
    expect(fromMoscow("", "19:00")).toBeNull();
    expect(fromMoscow("2026-10-15", "")).toBeNull();
    expect(fromMoscow("15.10.2026", "19:00")).toBeNull();
  });

  it("момент из API → поля даты и времени по Москве", () => {
    expect(toMoscow("2026-10-15T16:00:00Z")).toEqual({ date: "2026-10-15", time: "19:00" });
    expect(toMoscow("2026-10-15T22:30:00Z")).toEqual({ date: "2026-10-16", time: "01:30" });
    expect(toMoscow(null)).toEqual({ date: "", time: "" });
  });

  it("туда и обратно — без сдвига", () => {
    const { date, time } = toMoscow("2026-07-01T05:45:00Z");
    expect(fromMoscow(date, time)).toBe("2026-07-01T05:45:00.000Z");
  });
});

describe("адрес страницы (slug)", () => {
  it("предлагаем адрес из названия — как сделает сервер", () => {
    expect(slugify("Как заваривать пуэр")).toBe("kak-zavarivat-puer");
    expect(slugify("Чай в термосе!")).toBe("chai-v-termose");
    expect(slugify("Ёлка и Щедрость")).toBe("elka-i-shchedrost");
    expect(slugify("   ")).toBe("");
  });

  it("только латиница, цифры и дефисы", () => {
    expect(slugError("", "page")).toBeNull();
    expect(slugError("shu-puer", "page")).toBeNull();
    expect(slugError("О нас", "page")).toMatch(/латиница/);
    expect(slugError("shu-puer-", "guide")).toMatch(/латиница/);
    expect(slugError("Shu", "guide")).toMatch(/латиница/);
  });

  it("адреса разделов сайта заняты — страница по ним не откроется", () => {
    expect(slugError("catalog", "page")).toMatch(/занят/);
    expect(slugError("events", "page")).toMatch(/занят/);
    // у гайдов и документов свой раздел — там можно
    expect(slugError("catalog", "guide")).toBeNull();
  });

  it("ссылка на сайте зависит от вида страницы", () => {
    expect(pagePath({ kind: "page", slug: "about" })).toBe("/about");
    expect(pagePath({ kind: "guide", slug: "gongfu" })).toBe("/guides/gongfu");
    expect(pagePath({ kind: "legal", slug: "offer" })).toBe("/legal/offer");
  });
});

describe("предпросмотр события — как в списке на сайте", () => {
  const base = {
    type: "rafting" as const,
    title: "Сплав",
    slug: "splav",
    starts_at: "2026-10-15T16:00:00.000Z",
    ends_at: null,
    place: "Клязьма",
    duration_text: null,
    price_kop: 350_000,
    price_text: null,
    seats_total: 8,
    seats_taken: 3,
    note: null,
    cover: null,
    short_description: null,
    description: null,
  };
  const now = new Date("2026-10-08T12:00:00Z");

  it("день, месяц, день недели и время — по Москве", () => {
    const e = eventPreview(base, now);
    expect(e.day).toBe("15");
    expect(e.month_label).toBe("октября");
    expect(e.weekday).toBe("Чт");
    expect(e.time).toBe("19:00");
    expect(e.type_label).toBe("Сплав на сапах");
  });

  it("цена: свой текст важнее суммы", () => {
    expect(eventPreview(base, now).price_label).toBe("3 500 ₽");
    expect(eventPreview({ ...base, price_text: "Бесплатно, по записи" }, now).price_label).toBe("Бесплатно, по записи");
    expect(eventPreview({ ...base, price_kop: null }, now).price_label).toBeNull();
  });

  it("места: сколько осталось; закончились — записаться нельзя", () => {
    expect(eventPreview(base, now)).toMatchObject({ seats_left: 5, seats_label: "Осталось 5 мест", can_book: true });
    expect(eventPreview({ ...base, seats_taken: 8 }, now)).toMatchObject({ seats_left: 0, seats_label: "Мест нет", can_book: false });
    expect(eventPreview({ ...base, seats_total: null }, now)).toMatchObject({ seats_left: null, seats_label: null, can_book: true });
  });

  it("прошедшее событие — без записи", () => {
    const e = eventPreview({ ...base, starts_at: "2026-10-01T16:00:00.000Z" }, now);
    expect(e.is_past).toBe(true);
    expect(e.can_book).toBe(false);
  });
});

describe("блоки главной — поля по виду блока", () => {
  it("у каждого блока главной есть понятное описание", () => {
    for (const kind of ["hero", "thursday", "services", "featured", "new_products", "sets", "events", "about", "advantages", "wholesale"] as const) {
      expect(BLOCK_SCHEMAS[kind].description.length).toBeGreaterThan(10);
    }
  });

  it("баннер: заголовок, кнопки и фото", () => {
    const keys = BLOCK_SCHEMAS.hero.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["title_line1", "title_line2", "text", "primary_label", "primary_href", "image_media_id"]));
  });
});
