import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MoneyField } from "./MoneyField";

function Harness({ onValue, initial = null }: { onValue: (kop: number | null) => void; initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <MoneyField
      label="Цена"
      value={value}
      onChange={(kop) => {
        setValue(kop);
        onValue(kop);
      }}
    />
  );
}

describe("MoneyField — сумма в рублях, хранится в копейках", () => {
  it("рубли с копейками превращаются в копейки", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText("Цена"), "1200,50");
    await userEvent.tab();
    expect(onValue).toHaveBeenLastCalledWith(120_050);
  });

  it("показывает сохранённое значение в рублях", () => {
    render(<Harness onValue={vi.fn()} initial={140_000} />);
    expect(screen.getByLabelText("Цена")).toHaveValue("1400");
  });

  it("не цена — понятная ошибка", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText("Цена"), "12р");
    await userEvent.tab();
    expect(screen.getByText("Введите сумму в рублях, например 1200 или 1200,50")).toBeInTheDocument();
  });

  it("пустое поле — null", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} initial={100} />);
    await userEvent.clear(screen.getByLabelText("Цена"));
    await userEvent.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
  });
});
