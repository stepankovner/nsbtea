import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Hint } from "./Hint";

describe("Hint — подсказка «?» у поля", () => {
  it("открывается по нажатию (работает на телефоне) и показывает пример", async () => {
    render(<Hint label="Цена за 50 г">Например, 1400. Цена 100 г посчитается сама.</Hint>);
    expect(screen.queryByText(/Цена 100 г посчитается сама/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Подсказка: Цена за 50 г" }));
    expect(await screen.findByText(/Цена 100 г посчитается сама/)).toBeInTheDocument();
  });
});
