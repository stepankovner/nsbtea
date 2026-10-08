import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inventoryApi } from "@/lib/admin/inventory";
import { lookupProducts } from "@/lib/admin/lookup";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { CountForm } from "./CountForm";
import { ALL_ROWS, lookupOf } from "./fixtures";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => search,
  usePathname: () => "/admin/inventory/count",
}));
vi.mock("@/lib/admin/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/inventory")>();
  return { ...actual, inventoryApi: { stock: vi.fn(), count: vi.fn() } };
});
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  vi.mocked(inventoryApi.stock).mockResolvedValue({ items: ALL_ROWS });
  vi.mocked(lookupProducts).mockImplementation(async (params) =>
    ALL_ROWS.filter((r) => !params.ids || params.ids.includes(r.product_id)).map(lookupOf),
  );
});

const next = () => userEvent.click(screen.getByRole("button", { name: /Дальше/ }));

describe("CountForm — инвентаризация", () => {
  it("выбрать товары поиском", async () => {
    renderWithAdmin(<CountForm />);
    await userEvent.click(screen.getByRole("button", { name: "Добавить товар" }));
    await userEvent.click(await screen.findByRole("option", { name: /Бай Му Дань/ }));
    await next();
    expect(await screen.findByLabelText("Бай Му Дань")).toBeInTheDocument();
  });

  it("фактический остаток → разница → причина → провести", async () => {
    search = new URLSearchParams("products=p1,p2");
    vi.mocked(inventoryApi.count).mockResolvedValue({
      changed: 1,
      lines: [
        { product_id: "p1", product_name: "Да Хун Пао", before: 150, actual: 120, delta: -30, delta_label: "−30 г" },
        { product_id: "p2", product_name: "Бай Му Дань", before: 30, actual: 30, delta: 0, delta_label: "без изменений" },
      ],
    });
    renderWithAdmin(<CountForm />);

    const tea = await screen.findByLabelText("Да Хун Пао");
    expect(tea).toHaveAttribute("inputmode", "numeric");
    expect(await screen.findByText(/По учёту: 150 г/)).toBeInTheDocument();
    await userEvent.type(tea, "120");
    expect(screen.getByText(/Разница: −30 г/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Бай Му Дань"), "30");
    expect(screen.getByText(/без изменений/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Причина расхождения"), "Рассыпали при фасовке");
    await next();

    const summary = await screen.findByRole("list", { name: "Что изменится" });
    expect(within(summary).getByText(/150 г → 120 г/)).toBeInTheDocument();
    expect(within(summary).getByText("−30 г")).toBeInTheDocument();
    expect(within(summary).getByText("без изменений")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Провести инвентаризацию" }));
    expect(inventoryApi.count).toHaveBeenCalledWith({
      comment: "Рассыпали при фасовке",
      lines: [
        { product_id: "p1", actual: 120 },
        { product_id: "p2", actual: 30 },
      ],
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/1 товар/)));
    expect(push).toHaveBeenCalledWith("/admin/inventory?tab=history");
  });

  it("ноль можно — товар закончился; дроби нельзя", async () => {
    search = new URLSearchParams("products=p1");
    vi.mocked(inventoryApi.count).mockResolvedValue({ changed: 1, lines: [] });
    renderWithAdmin(<CountForm />);
    const tea = await screen.findByLabelText("Да Хун Пао");
    await userEvent.type(tea, "12,5");
    expect(screen.getByText(/Только целые граммы/)).toBeInTheDocument();
    await userEvent.clear(tea);
    await userEvent.type(tea, "0");
    expect(await screen.findByText(/Разница: −150 г/)).toBeInTheDocument();
    await next();
    await userEvent.click(await screen.findByRole("button", { name: "Провести инвентаризацию" }));
    expect(inventoryApi.count).toHaveBeenCalledWith(expect.objectContaining({ lines: [{ product_id: "p1", actual: 0 }] }));
  });

  it("пустое поле не пропускаем", async () => {
    search = new URLSearchParams("products=p1");
    renderWithAdmin(<CountForm />);
    await screen.findByLabelText("Да Хун Пао");
    await next();
    expect(screen.getByText("Укажите, сколько есть на самом деле")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Провести инвентаризацию" })).not.toBeInTheDocument();
  });

  it("ошибку сервера показываем его текстом", async () => {
    search = new URLSearchParams("products=p1");
    vi.mocked(inventoryApi.count).mockRejectedValue(new ApiError(404, "Некоторые товары не найдены — обновите страницу", "not_found"));
    renderWithAdmin(<CountForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "100");
    await next();
    await userEvent.click(await screen.findByRole("button", { name: "Провести инвентаризацию" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Некоторые товары не найдены — обновите страницу");
    expect(push).not.toHaveBeenCalled();
  });
});
