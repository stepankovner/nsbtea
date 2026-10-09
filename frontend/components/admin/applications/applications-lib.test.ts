import { describe, expect, it } from "vitest";

import { applicationDetails, contactLinks } from "@/lib/admin/applications";

import { application, eventApplication } from "./fixtures";

describe("заявка — что хочет человек", () => {
  it("поля формы — с понятными подписями и в понятном порядке", () => {
    expect(applicationDetails(application())).toEqual([
      { key: "organization", label: "Организация", value: "Кофейня «Ромашка»" },
      { key: "city", label: "Город", value: "Владимир" },
      { key: "volume", label: "Объём в месяц", value: "2–3 кг" },
      { key: "comment", label: "Комментарий", value: "Пришлите прайс на пуэры" },
    ]);
  });

  it("пустые поля не показываем, незнакомые — как есть", () => {
    const details = applicationDetails(
      application({ data: { city: "", promo: "осень", guests: 12 } }),
    );
    expect(details).toEqual([
      { key: "guests", label: "Гостей", value: "12" },
      { key: "promo", label: "promo", value: "осень" },
    ]);
  });

  it("запись на событие: сколько гостей", () => {
    expect(applicationDetails(eventApplication())).toEqual([
      { key: "guests", label: "Гостей", value: "2" },
    ]);
  });
});

describe("заявка — как связаться", () => {
  it("телефон, Telegram и почта — ссылками", () => {
    expect(contactLinks(application())).toEqual([
      { kind: "phone", label: "+7 900 123-45-67", href: "tel:+79001234567" },
      { kind: "email", label: "oleg@example.ru", href: "mailto:oleg@example.ru" },
    ]);
    expect(contactLinks(eventApplication())).toEqual([
      { kind: "telegram", label: "@ira_tea", href: "https://t.me/ira_tea" },
    ]);
  });
});
