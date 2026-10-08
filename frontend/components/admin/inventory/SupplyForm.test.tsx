import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inventoryApi } from "@/lib/admin/inventory";
import { lookupProducts } from "@/lib/admin/lookup";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { ALL_ROWS, lookupOf } from "./fixtures";
import { SupplyForm } from "./SupplyForm";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => search,
  usePathname: () => "/admin/inventory/supply",
}));
vi.mock("@/lib/admin/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/inventory")>();
  return { ...actual, inventoryApi: { stock: vi.fn(), postSupply: vi.fn() } };
});
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const posted = {
  id: "s1",
  comment: null,
  posted_at: "2026-10-08T09:00:00Z",
  lines: [{ product_id: "p1", product_name: "Да Хун Пао", delta: 500, qty_label: "500 г", balance_after: 650, balance_label: "650 г" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  vi.mocked(inventoryApi.stock).mockResolvedValue({ items: ALL_ROWS });
  vi.mocked(lookupProducts).mockImplementation(async (params) =>
    ALL_ROWS.filter((r) => !params.ids || params.ids.includes(r.product_id)).map(lookupOf),
  );
});

const next = () => userEvent.click(screen.getByRole("button", { name: /Дальше/ }));

describe("SupplyForm — принять поставку", () => {
  it("главный сценарий: товары → сколько пришло → что изменится → провести", async () => {
    vi.mocked(inventoryApi.postSupply).mockResolvedValue(posted);
    renderWithAdmin(<SupplyForm />);

    // шаг 1: выбор товаров поиском
    expect(screen.getByRole("heading", { name: /Что пришло/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Добавить товар" }));
    await userEvent.type(screen.getByPlaceholderText("Название товара"), "хун");
    await userEvent.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
    await next();

    // шаг 2: крупное числовое поле, граммы рядом с полем, видно «было → станет»
    expect(await screen.findByRole("heading", { name: /Сколько пришло/ })).toBeInTheDocument();
    const field = await screen.findByLabelText("Да Хун Пао");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByText("г")).toBeInTheDocument();
    await userEvent.type(field, "500");
    expect(await screen.findByText(/станет 650 г/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Поставщик или комментарий"), "Поставщик Ли");
    await next();

    // шаг 3: итог
    const summary = await screen.findByRole("list", { name: "Что изменится" });
    expect(within(summary).getByText("Да Хун Пао")).toBeInTheDocument();
    expect(within(summary).getByText(/150 г → 650 г/)).toBeInTheDocument();
    expect(within(summary).getByText("+500 г")).toBeInTheDocument();
    expect(screen.getByText(/Поставщик Ли/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Провести поставку" }));
    expect(inventoryApi.postSupply).toHaveBeenCalledWith({ comment: "Поставщик Ли", lines: [{ product_id: "p1", qty: 500 }] });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/admin/inventory?tab=history");
  });

  it("из «Нужно дозаказать» — товары уже выбраны, сразу вводим количество; у штучных — штуки", async () => {
    search = new URLSearchParams("products=p2,p3");
    vi.mocked(inventoryApi.postSupply).mockResolvedValue(posted);
    renderWithAdmin(<SupplyForm />);

    const tea = await screen.findByLabelText("Бай Му Дань");
    const cups = screen.getByLabelText("Гайвань");
    expect(screen.getByText("шт.")).toBeInTheDocument();
    await userEvent.type(tea, "1000");
    await userEvent.type(cups, "4");
    expect(await screen.findByText(/станет 1 030 г/)).toBeInTheDocument();
    expect(screen.getByText(/станет 4 шт\./)).toBeInTheDocument();
    await next();

    const summary = await screen.findByRole("list", { name: "Что изменится" });
    expect(within(summary).getByText(/0 шт\. → 4 шт\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Провести поставку" }));
    expect(inventoryApi.postSupply).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          { product_id: "p2", qty: 1000 },
          { product_id: "p3", qty: 4 },
        ],
      }),
    );
  });

  it("с шага проверки можно вернуться и поправить число", async () => {
    search = new URLSearchParams("products=p1");
    renderWithAdmin(<SupplyForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "50");
    await next();
    await screen.findByRole("list", { name: "Что изменится" });
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    const field = await screen.findByLabelText("Да Хун Пао");
    expect(field).toHaveValue("50");
    await userEvent.type(field, "0");
    await next();
    expect(within(await screen.findByRole("list", { name: "Что изменится" })).getByText(/150 г → 650 г/)).toBeInTheDocument();
  });

  it("без товаров дальше не идём — подсказываем, что сделать", async () => {
    renderWithAdmin(<SupplyForm />);
    await next();
    expect(screen.getByText(/Добавьте хотя бы один товар/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Сколько пришло/ })).not.toBeInTheDocument();
  });

  it("вес — только целые граммы, штуки — целые; пустое и ноль не пропускаем", async () => {
    search = new URLSearchParams("products=p1,p3");
    renderWithAdmin(<SupplyForm />);
    const tea = await screen.findByLabelText("Да Хун Пао");
    await userEvent.type(tea, "2,5");
    expect(screen.getByText(/Только целые граммы/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Гайвань"), "1.5");
    expect(screen.getByText(/Только целое число штук/)).toBeInTheDocument();
    await next();
    expect(screen.queryByRole("button", { name: "Провести поставку" })).not.toBeInTheDocument();

    await userEvent.clear(tea);
    await userEvent.type(tea, "0");
    expect(screen.getByText(/больше нуля/)).toBeInTheDocument();
    await userEvent.clear(tea);
    await next();
    expect(screen.getByText("Укажите, сколько пришло")).toBeInTheDocument();
    expect(inventoryApi.postSupply).not.toHaveBeenCalled();
  });

  it("ошибку сервера показываем его текстом и никуда не уходим", async () => {
    search = new URLSearchParams("products=p1");
    vi.mocked(inventoryApi.postSupply).mockRejectedValue(
      new ApiError(422, "Слишком много для одной поставки (900 000 г) — проверьте число", "domain_error", { field: "qty" }),
    );
    renderWithAdmin(<SupplyForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "900000");
    await next();
    await userEvent.click(await screen.findByRole("button", { name: "Провести поставку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Слишком много для одной поставки (900 000 г) — проверьте число");
    expect(push).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
