import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { lookupProducts } from "@/lib/admin/lookup";
import { renderWithAdmin } from "@/tests/admin";

import { ProductPicker } from "./ProductPicker";

vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));

const tea = { id: "p1", slug: "da-hun-pao", name: "Да Хун Пао", type: "tea", status: "published", image_url: null, stock_label: "600 г" };
const cup = { id: "p2", slug: "gaivan", name: "Гайвань", type: "unit", status: "published", image_url: null, stock_label: "6 шт." };

function Harness({ initial = [] as string[], max }: { initial?: string[]; max?: number }) {
  const [ids, setIds] = useState(initial);
  return (
    <>
      <ProductPicker label="Товары в акции" value={ids} onChange={setIds} max={max} />
      <output data-testid="ids">{ids.join(",")}</output>
    </>
  );
}

describe("ProductPicker — выбор товаров", () => {
  it("показывает выбранные и позволяет убрать", async () => {
    vi.mocked(lookupProducts).mockResolvedValue([tea, cup]);
    renderWithAdmin(<Harness initial={["p1", "p2"]} />);
    expect(await screen.findByText("Да Хун Пао")).toBeInTheDocument();
    expect(lookupProducts).toHaveBeenCalledWith({ ids: ["p1", "p2"] });
    await userEvent.click(screen.getByRole("button", { name: "Убрать: Гайвань" }));
    expect(screen.getByTestId("ids")).toHaveTextContent(/^p1$/);
  });

  it("поиск и добавление", async () => {
    vi.mocked(lookupProducts).mockImplementation(async (params) => (params.ids ? [] : [tea, cup]));
    renderWithAdmin(<Harness />);
    expect(screen.getByText(/Пока ничего не выбрано/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Добавить товар" }));
    await userEvent.type(screen.getByPlaceholderText("Название товара"), "хун");
    await userEvent.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
    expect(screen.getByTestId("ids")).toHaveTextContent("p1");
  });

  it("не больше заданного числа", async () => {
    vi.mocked(lookupProducts).mockResolvedValue([tea]);
    renderWithAdmin(<Harness initial={["p1"]} max={1} />);
    expect(await screen.findByText("Да Хун Пао")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить товар" })).toBeDisabled();
  });
});
