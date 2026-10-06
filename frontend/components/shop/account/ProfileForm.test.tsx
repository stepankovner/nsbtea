import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";

import { ProfileForm } from "./ProfileForm";

vi.mock("@/lib/shop-api", () => ({
  shopApi: { updateProfile: vi.fn(), deleteAccount: vi.fn(), logout: vi.fn() },
}));

const me = {
  id: "0192f000-0000-7000-8000-0000000000d1",
  email: "nikita@nsbtea.ru",
  name: "Никита",
  phone: "+79001234567",
  telegram_username: null,
  telegram_linked: false,
  marketing_consent: false,
  points_balance: 120,
  points_pending: 40,
};

describe("ProfileForm — профиль покупателя", () => {
  it("сохраняет имя, телефон и согласие на рассылку", async () => {
    vi.mocked(shopApi.updateProfile).mockResolvedValue({ ...me, name: "Никита С.", marketing_consent: true });
    render(<ProfileForm me={me} navigate={vi.fn()} />);
    const name = screen.getByLabelText("Имя");
    await userEvent.clear(name);
    await userEvent.type(name, "Никита С.");
    await userEvent.click(screen.getByRole("checkbox", { name: /новости и акции/ }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(shopApi.updateProfile).toHaveBeenCalledWith({
      name: "Никита С.",
      phone: "+79001234567",
      marketing_consent: true,
    });
    expect(await screen.findByText("Сохранено")).toBeInTheDocument();
  });

  it("удаление аккаунта — только после явного подтверждения с объяснением последствий", async () => {
    const navigate = vi.fn();
    vi.mocked(shopApi.deleteAccount).mockResolvedValue({ ok: true });
    render(<ProfileForm me={me} navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Удалить аккаунт" }));
    expect(screen.getByText(/баллы сгорят/)).toBeInTheDocument();
    expect(shopApi.deleteAccount).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Да, удалить навсегда" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Напишите «удалить»/), "удалить");
    await userEvent.click(confirm);
    expect(shopApi.deleteAccount).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
