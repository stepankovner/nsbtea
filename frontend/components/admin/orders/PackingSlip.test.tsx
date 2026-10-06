import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { adminOrder } from "./fixtures";
import { PackingSlip } from "./PackingSlip";

describe("PackingSlip — упаковочный лист", () => {
  it("номер, получатель, доставка и состав с граммовками", () => {
    render(<PackingSlip order={adminOrder()} size="a4" />);
    expect(screen.getByText("NSB-10001")).toBeInTheDocument();
    expect(screen.getByText("Аня")).toBeInTheDocument();
    expect(screen.getByText("+7 900 123-45-67")).toBeInTheDocument();
    expect(screen.getByText("СДЭК — пункт выдачи")).toBeInTheDocument();
    expect(screen.getByText("Москва, ПВЗ MSK1: Тверская, 1")).toBeInTheDocument();
    const row = screen.getByText("Да Хун Пао").closest("tr");
    expect(row).toHaveTextContent("50 г");
    expect(row).toHaveTextContent("2");
    expect(screen.getByText("Позвоните заранее")).toBeInTheDocument();
  });

  it("формат A6 — компактная разметка", () => {
    const { container } = render(<PackingSlip order={adminOrder()} size="a6" />);
    expect(container.querySelector("[data-size=a6]")).not.toBeNull();
  });
});
