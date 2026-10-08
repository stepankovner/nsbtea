import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lookupProducts } from "@/lib/admin/lookup";
import { promotionsApi } from "@/lib/admin/promotions";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { categoryTree, lookupTea, promoCode } from "./fixtures";
import { PromoCodeForm } from "./PromoCodeForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));
vi.mock("@/lib/admin/promotions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/promotions")>();
  return {
    ...actual,
    promotionsApi: { codes: vi.fn(), createCode: vi.fn(), updateCode: vi.fn(), archiveCode: vi.fn(), categories: vi.fn() },
  };
});

function mockApi() {
  vi.mocked(lookupProducts).mockImplementation(async (params) => (params.ids ? [lookupTea].filter((p) => params.ids?.includes(p.id)) : [lookupTea]));
  vi.mocked(promotionsApi.categories).mockResolvedValue(categoryTree());
  vi.mocked(promotionsApi.codes).mockResolvedValue([promoCode()]);
  vi.mocked(promotionsApi.createCode).mockResolvedValue(promoCode());
  vi.mocked(promotionsApi.updateCode).mockResolvedValue(promoCode());
  vi.mocked(promotionsApi.archiveCode).mockResolvedValue({ ok: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PromoCodeForm — новый промокод", () => {
  it("код заглавными, скидка, условия и лимиты уходят на сервер", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromoCodeForm />);
    const code = screen.getByLabelText(/^Промокод( \*)?$/);
    await user.type(code, "chai10");
    expect(code).toHaveValue("CHAI10");
    await user.type(screen.getByLabelText(/^Заметка для себя/), "Для подписчиков Telegram");
    await user.type(screen.getByLabelText(/^Скидка, %/), "10");
    await user.type(screen.getByLabelText(/^Минимальная сумма заказа/), "2000");
    await user.tab();
    await user.type(screen.getByLabelText(/^Сколько раз можно использовать всего/), "100");
    await user.type(screen.getByLabelText(/^Сколько раз — одному покупателю/), "1");
    await user.click(screen.getByRole("checkbox", { name: /Только на первый заказ/ }));
    await user.click(screen.getByRole("button", { name: "Создать промокод" }));
    expect(promotionsApi.createCode).toHaveBeenCalledWith({
      code: "CHAI10",
      description: "Для подписчиков Telegram",
      percent: 10,
      amount_kop: null,
      min_order_kop: 200_000,
      max_uses: 100,
      max_uses_per_customer: 1,
      first_order_only: true,
      applies_to_discounted: false,
      starts_at: null,
      ends_at: null,
      is_active: true,
      product_ids: [],
      category_ids: [],
    });
    expect(push).toHaveBeenCalledWith("/admin/promotions");
  });

  it("фиксированная скидка в рублях, только на выбранный товар и на акционные тоже", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromoCodeForm />);
    await user.type(screen.getByLabelText(/^Промокод( \*)?$/), "MINUS300");
    await user.click(screen.getByRole("radio", { name: "В рублях" }));
    await user.type(screen.getByLabelText(/^Скидка, ₽/), "300");
    await user.tab();
    await user.click(screen.getByRole("checkbox", { name: /Действует и на товары со скидкой/ }));
    await user.click(screen.getByRole("button", { name: "Добавить товар" }));
    await user.type(screen.getByPlaceholderText("Название товара"), "хун");
    await user.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
    await user.click(screen.getByRole("button", { name: "Создать промокод" }));
    expect(promotionsApi.createCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "MINUS300",
        percent: null,
        amount_kop: 30_000,
        min_order_kop: 0,
        max_uses: null,
        max_uses_per_customer: null,
        applies_to_discounted: true,
        product_ids: ["p1"],
      }),
    );
  });

  it("код проверяем сразу — латиница, цифры, дефис", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromoCodeForm />);
    await user.type(screen.getByLabelText(/^Промокод( \*)?$/), "ЧАЙ");
    await user.type(screen.getByLabelText(/^Скидка, %/), "10");
    await user.click(screen.getByRole("button", { name: "Создать промокод" }));
    expect(await screen.findByText(/латинские буквы, цифры, дефис или подчёркивание/)).toBeInTheDocument();
    expect(promotionsApi.createCode).not.toHaveBeenCalled();
  });

  it("подсказка к коду — с примером; код можно скопировать", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromoCodeForm />);
    await user.click(screen.getByRole("button", { name: "Подсказка: Промокод" }));
    expect(await screen.findByText(/Например: CHAI10/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Промокод( \*)?$/), "osen-2026");
    await user.click(screen.getByRole("button", { name: "Скопировать" }));
    expect(await navigator.clipboard.readText()).toBe("OSEN-2026");
  });

  it("занятый код — ошибка сервера у поля", async () => {
    const user = userEvent.setup();
    mockApi();
    vi.mocked(promotionsApi.createCode).mockRejectedValue(new ApiError(409, "Такой промокод уже есть", "conflict", { field: "code" }));
    renderWithAdmin(<PromoCodeForm />);
    await user.type(screen.getByLabelText(/^Промокод( \*)?$/), "CHAI10");
    await user.type(screen.getByLabelText(/^Скидка, %/), "10");
    await user.click(screen.getByRole("button", { name: "Создать промокод" }));
    expect(await screen.findByText("Такой промокод уже есть")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("PromoCodeForm — изменение промокода", () => {
  it("поля заполнены, видно, сколько раз использовали; изменения сохраняются", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromoCodeForm id="pc1" />);
    expect(await screen.findByLabelText(/^Промокод( \*)?$/)).toHaveValue("CHAI10");
    expect(screen.getByLabelText(/^Минимальная сумма заказа/)).toHaveValue("2000");
    expect(screen.getByLabelText(/^Сколько раз можно использовать всего/)).toHaveValue("100");
    expect(screen.getByText(/5 раз, скидка 1\s500\s₽/)).toBeInTheDocument();
    const max = screen.getByLabelText(/^Сколько раз можно использовать всего/);
    await user.clear(max);
    await user.type(max, "200");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(promotionsApi.updateCode).toHaveBeenCalledWith("pc1", {
      code: "CHAI10",
      description: "Для подписчиков Telegram",
      percent: 10,
      amount_kop: null,
      min_order_kop: 200_000,
      max_uses: 200,
      max_uses_per_customer: 1,
      first_order_only: false,
      applies_to_discounted: false,
      starts_at: null,
      ends_at: null,
      is_active: true,
      product_ids: [],
      category_ids: [],
    });
  });

  it("в архив — после подтверждения", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromoCodeForm id="pc1" />);
    await user.click(await screen.findByRole("button", { name: "Убрать в архив" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/перестанет действовать/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Да, убрать в архив" }));
    expect(promotionsApi.archiveCode).toHaveBeenCalledWith("pc1");
    expect(push).toHaveBeenCalledWith("/admin/promotions");
  });

  it("промокода нет — понятное сообщение", async () => {
    mockApi();
    vi.mocked(promotionsApi.codes).mockResolvedValue([]);
    renderWithAdmin(<PromoCodeForm id="nope" />);
    expect(await screen.findByText(/Промокод не найден/)).toBeInTheDocument();
  });
});
