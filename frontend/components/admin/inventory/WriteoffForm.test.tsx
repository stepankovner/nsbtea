import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inventoryApi } from "@/lib/admin/inventory";
import { lookupProducts } from "@/lib/admin/lookup";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { ALL_ROWS, lookupOf } from "./fixtures";
import { WriteoffForm } from "./WriteoffForm";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => search,
  usePathname: () => "/admin/inventory/writeoff",
}));
vi.mock("@/lib/admin/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/inventory")>();
  return { ...actual, inventoryApi: { stock: vi.fn(), writeOff: vi.fn() } };
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

describe("WriteoffForm — списание", () => {
  it("выбрать товар поиском", async () => {
    renderWithAdmin(<WriteoffForm />);
    expect(screen.getByRole("heading", { name: /Что списываем/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Добавить товар" }));
    await userEvent.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
    await userEvent.click(screen.getByRole("button", { name: /Дальше/ }));
    expect(await screen.findByLabelText("Да Хун Пао")).toBeInTheDocument();
  });

  it("причины — как в API: брак, дегустация, личное, другое", async () => {
    search = new URLSearchParams("products=p1");
    renderWithAdmin(<WriteoffForm />);
    await screen.findByLabelText("Да Хун Пао");
    const reasons = screen.getByRole("radiogroup", { name: /Причина/ });
    expect(within(reasons).getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["defect", "tasting", "personal", "other"]);
    expect(within(reasons).getByRole("radio", { name: /Брак/ })).toBeInTheDocument();
    expect(within(reasons).getByRole("radio", { name: /Личное/ })).toBeInTheDocument();
    expect(within(reasons).getByRole("radio", { name: /Другое/ })).toBeInTheDocument();
  });

  it("сколько и почему → окно с последствиями → списать", async () => {
    search = new URLSearchParams("products=p1");
    vi.mocked(inventoryApi.writeOff).mockResolvedValue({
      lines: [{ product_id: "p1", product_name: "Да Хун Пао", delta: -50, qty_label: "50 г", balance_after: 100, balance_label: "100 г" }],
    });
    renderWithAdmin(<WriteoffForm />);

    const qty = await screen.findByLabelText("Да Хун Пао");
    expect(qty).toHaveAttribute("inputmode", "numeric");
    await userEvent.type(qty, "50");
    expect(await screen.findByText(/останется 100 г/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Дегустация/ }));
    await userEvent.type(screen.getByLabelText("Комментарий"), "Чайная церемония в субботу");

    await userEvent.click(screen.getByRole("button", { name: "Списать" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/150 г → 100 г/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Дегустация/)).toBeInTheDocument();
    // объясняем, как исправить ошибку
    expect(within(dialog).getByText(/Инвентаризаци/)).toBeInTheDocument();
    expect(inventoryApi.writeOff).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Да, списать" }));
    expect(inventoryApi.writeOff).toHaveBeenCalledWith({
      reason: "tasting",
      comment: "Чайная церемония в субботу",
      lines: [{ product_id: "p1", qty: 50 }],
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/admin/inventory?tab=history");
  });

  it("больше, чем на складе, списать нельзя — понятный текст", async () => {
    search = new URLSearchParams("products=p1");
    renderWithAdmin(<WriteoffForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "200");
    await userEvent.click(screen.getByRole("radio", { name: /Брак/ }));
    expect(screen.getByText("Нельзя списать 200 г: на складе 150 г")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Списать" })).toBeDisabled();
  });

  it("без причины не списываем — подсказываем выбрать", async () => {
    search = new URLSearchParams("products=p1");
    renderWithAdmin(<WriteoffForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "50");
    expect(screen.getByRole("button", { name: "Списать" })).toBeDisabled();
    expect(screen.getByText(/Выберите причину/)).toBeInTheDocument();
  });

  it("вес — только целые граммы", async () => {
    search = new URLSearchParams("products=p1");
    renderWithAdmin(<WriteoffForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "7.5");
    expect(screen.getByText(/Только целые граммы/)).toBeInTheDocument();
  });

  it("ошибка сервера — его текстом в окне подтверждения", async () => {
    search = new URLSearchParams("products=p1");
    vi.mocked(inventoryApi.writeOff).mockRejectedValue(
      new ApiError(409, "«Да Хун Пао»: нельзя списать 100 г: на складе 80 г", "insufficient_stock"),
    );
    renderWithAdmin(<WriteoffForm />);
    await userEvent.type(await screen.findByLabelText("Да Хун Пао"), "100");
    await userEvent.click(screen.getByRole("radio", { name: /Брак/ }));
    await userEvent.click(screen.getByRole("button", { name: "Списать" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, списать" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("«Да Хун Пао»: нельзя списать 100 г: на складе 80 г");
    expect(push).not.toHaveBeenCalled();
  });
});
