import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  normalizePhone,
  validateApplication,
  validateCheckout,
  type CheckoutForm,
} from "./validation";

describe("normalizePhone — как на сервере", () => {
  it.each([
    ["+7 900 123-45-67", "+79001234567"],
    ["89001234567", "+79001234567"],
    ["79001234567", "+79001234567"],
    ["9001234567", "+79001234567"],
    ["(900) 123 45 67", "+79001234567"],
  ])("«%s» → %s", (input, phone) => {
    expect(normalizePhone(input)).toBe(phone);
  });

  it.each(["", "12345", "+7 900 123", "+1 202 555 0100 1"])("«%s» — не телефон", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("isValidEmail", () => {
  it("принимает обычные адреса", () => {
    expect(isValidEmail("nikita@nsbtea.ru")).toBe(true);
    expect(isValidEmail(" a.b+c@mail.example.org ")).toBe(true);
  });
  it("отклоняет явный мусор", () => {
    expect(isValidEmail("nikita")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a @b.ru")).toBe(false);
  });
});

const base: CheckoutForm = {
  name: "Никита",
  phone: "+7 900 123-45-67",
  email: "nikita@nsbtea.ru",
  delivery: { method: "pickup" },
  consentOffer: true,
  consentPd: true,
};

describe("validateCheckout", () => {
  it("корректная форма — без ошибок", () => {
    expect(validateCheckout(base)).toEqual({});
  });

  it("контакты", () => {
    const errors = validateCheckout({ ...base, name: " ", phone: "123", email: "x" });
    expect(errors).toEqual({
      name: "Укажите имя",
      phone: "Нужен номер из 10–11 цифр",
      email: "Проверьте адрес почты — на него придут чек и статус заказа",
    });
  });

  it("оба согласия обязательны и проверяются отдельно", () => {
    const errors = validateCheckout({ ...base, consentOffer: false, consentPd: false });
    expect(errors.consentOffer).toBe("Нужно принять условия оферты");
    expect(errors.consentPd).toBe("Нужно согласие на обработку персональных данных");
  });

  it("СДЭК до пункта выдачи — нужен выбранный пункт", () => {
    const errors = validateCheckout({ ...base, delivery: { method: "cdek_pvz", cityCode: 44 } });
    expect(errors.delivery).toBe("Выберите пункт выдачи СДЭК");
  });

  it("СДЭК до двери — город и адрес", () => {
    expect(validateCheckout({ ...base, delivery: { method: "cdek_door" } }).delivery).toBe(
      "Выберите город доставки",
    );
    expect(
      validateCheckout({ ...base, delivery: { method: "cdek_door", cityCode: 44, address: "" } })
        .address,
    ).toBe("Укажите адрес доставки");
  });

  it("курьер — адрес во Владимире", () => {
    expect(validateCheckout({ ...base, delivery: { method: "courier", address: "  " } }).address).toBe(
      "Укажите адрес доставки",
    );
    expect(
      validateCheckout({ ...base, delivery: { method: "courier", address: "ул. Мира, 1, кв. 2" } }),
    ).toEqual({});
  });
});

describe("validateApplication — заявки (опт, событие, церемония)", () => {
  it("нужно имя, телефон или Telegram и согласие", () => {
    expect(validateApplication({ name: "", phone: "", telegram: "", consent: false })).toEqual({
      name: "Укажите имя",
      contact: "Оставьте телефон или Telegram — одно из двух",
      consent: "Нужно согласие на обработку персональных данных",
    });
  });
  it("достаточно Telegram", () => {
    expect(
      validateApplication({ name: "Аня", phone: "", telegram: "@anya", consent: true }),
    ).toEqual({});
  });
  it("неверный телефон", () => {
    expect(
      validateApplication({ name: "Аня", phone: "12", telegram: "", consent: true }).contact,
    ).toBe("Нужен номер из 10–11 цифр");
  });
});
