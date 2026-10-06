import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { ConfirmAction } from "./ConfirmAction";

describe("ConfirmAction — опасные действия с объяснением последствий", () => {
  it("ничего не делает без подтверждения", async () => {
    const action = vi.fn();
    render(
      <ConfirmAction
        trigger="Отменить заказ"
        title="Отменить заказ NSB-10001?"
        description="Товары вернутся на склад, покупателю уйдёт письмо об отмене."
        confirm="Да, отменить"
        onConfirm={action}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Отменить заказ" }));
    expect(await screen.findByText("Товары вернутся на склад, покупателю уйдёт письмо об отмене.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Не отменять" }));
    expect(action).not.toHaveBeenCalled();
  });

  it("выполняет действие после подтверждения", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmAction trigger="В архив" title="Убрать в архив?" description="Можно вернуть." confirm="В архив" onConfirm={action} />);
    await userEvent.click(screen.getByRole("button", { name: "В архив" }));
    await userEvent.click(await screen.findByRole("button", { name: "В архив", hidden: false }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("ошибка сервера видна в окне подтверждения", async () => {
    const action = vi.fn().mockRejectedValue(new ApiError(409, "Заказ уже отправлен — отменить нельзя", "invalid_transition"));
    render(<ConfirmAction trigger="Отменить" title="Отменить?" description="…" confirm="Да" onConfirm={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Отменить" }));
    await userEvent.click(await screen.findByRole("button", { name: "Да" }));
    expect(await screen.findByText("Заказ уже отправлен — отменить нельзя")).toBeInTheDocument();
  });
});
