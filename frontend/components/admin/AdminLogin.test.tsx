import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { adminAuth } from "@/lib/admin/auth";

import { AdminLogin } from "./AdminLogin";

vi.mock("@/lib/admin/auth", () => ({ adminAuth: { login: vi.fn(), twoFactor: vi.fn() } }));

const user = {
  id: "u1",
  name: "Никита",
  email: "nikita@nsbtea.ru",
  role: "owner",
  permissions: [],
  telegram_linked: true,
  expires_at: null,
  is_owner: true,
};

describe("AdminLogin — вход владельца и сотрудников", () => {
  const onSuccess = vi.fn();
  beforeEach(() => onSuccess.mockReset());

  it("почта и пароль → код из Telegram → вход", async () => {
    vi.mocked(adminAuth.login).mockResolvedValue({ status: "two_factor_required", challenge_id: "c1", user: null, csrf_token: null });
    vi.mocked(adminAuth.twoFactor).mockResolvedValue({ status: "ok", user, csrf_token: "csrf", challenge_id: null });
    render(<AdminLogin onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("Почта"), "nikita@nsbtea.ru");
    await userEvent.type(screen.getByLabelText("Пароль"), "very-secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(adminAuth.login).toHaveBeenCalledWith("nikita@nsbtea.ru", "very-secret-pass");
    expect(await screen.findByText(/Отправили код в Telegram/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Код из Telegram"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(adminAuth.twoFactor).toHaveBeenCalledWith("c1", "123456");
    expect(onSuccess).toHaveBeenCalledWith(user, "csrf");
  });

  it("без Telegram — вход сразу", async () => {
    vi.mocked(adminAuth.login).mockResolvedValue({ status: "ok", user, csrf_token: "csrf", challenge_id: null });
    render(<AdminLogin onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("Почта"), "nikita@nsbtea.ru");
    await userEvent.type(screen.getByLabelText("Пароль"), "very-secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(onSuccess).toHaveBeenCalledWith(user, "csrf");
  });

  it("неверный пароль — понятное сообщение, есть ссылка «Забыли пароль?»", async () => {
    vi.mocked(adminAuth.login).mockRejectedValue(new ApiError(401, "Неверная почта или пароль", "invalid_credentials"));
    render(<AdminLogin onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("Почта"), "nikita@nsbtea.ru");
    await userEvent.type(screen.getByLabelText("Пароль"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Неверная почта или пароль");
    expect(screen.getByRole("link", { name: "Забыли пароль?" })).toHaveAttribute("href", "/admin/reset");
  });
});
