import { describe, expect, it } from "vitest";

import { ApiError, errorMessage, fieldErrors, toApiError } from "./errors";

describe("toApiError — единый формат ошибок backend", () => {
  it("ошибка предметной области", () => {
    const error = toApiError(409, {
      detail: "Нельзя списать 200 г: на складе 150 г",
      code: "insufficient_stock",
      field: "qty",
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe("Нельзя списать 200 г: на складе 150 г");
    expect(error.code).toBe("insufficient_stock");
    expect(fieldErrors(error)).toEqual({ qty: "Нельзя списать 200 г: на складе 150 г" });
  });

  it("ошибки валидации по полям", () => {
    const error = toApiError(422, {
      detail: "Проверьте заполнение полей",
      code: "validation_error",
      errors: [
        { field: "name", message: "Заполните поле" },
        { field: "delivery.address", message: "Слишком длинно: не больше 400 символов" },
      ],
    });
    expect(fieldErrors(error)).toEqual({
      name: "Заполните поле",
      "delivery.address": "Слишком длинно: не больше 400 символов",
    });
  });

  it("дополнительные данные ошибки сохраняются (например, адрес переезда)", () => {
    const error = toApiError(404, { detail: "Страница переехала", code: "moved", location: "/product/new" });
    expect(error.extra.location).toBe("/product/new");
  });

  it("непонятный ответ — человеческий текст", () => {
    expect(toApiError(502, "<html>Bad gateway</html>").message).toBe(
      "Сервер временно недоступен. Попробуйте через минуту.",
    );
    expect(toApiError(500, null).message).toBe(
      "Что-то пошло не так. Попробуйте ещё раз или обновите страницу.",
    );
  });
});

describe("errorMessage", () => {
  it("берёт текст ApiError", () => {
    expect(errorMessage(new ApiError(400, "Неверный код", "invalid_code"))).toBe("Неверный код");
  });
  it("сетевой сбой", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(
      "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.",
    );
  });
  it("что угодно другое", () => {
    expect(errorMessage("boom")).toBe("Что-то пошло не так. Попробуйте ещё раз или обновите страницу.");
  });
});
