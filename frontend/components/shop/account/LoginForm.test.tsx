import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";

import { LoginForm } from "./LoginForm";

vi.mock("@/lib/shop-api", () => ({ shopApi: { requestCode: vi.fn(), verifyCode: vi.fn() } }));

describe("LoginForm — вход без пароля: код на почту", () => {
  const navigate = vi.fn();
  beforeEach(() => navigate.mockReset());

  it("почта → код → вход и возврат туда, откуда пришли", async () => {
    vi.mocked(shopApi.requestCode).mockResolvedValue({ ok: true, message: "Отправили код на nikita@nsbtea.ru. Он действует 10 минут." });
    vi.mocked(shopApi.verifyCode).mockResolvedValue({ ok: true });
    render(<LoginForm next="/cart" navigate={navigate} />);
    await userEvent.type(screen.getByLabelText("Почта"), "nikita@nsbtea.ru");
    await userEvent.click(screen.getByRole("button", { name: "Получить код" }));
    expect(shopApi.requestCode).toHaveBeenCalledWith("nikita@nsbtea.ru");
    expect(await screen.findByText("Отправили код на nikita@nsbtea.ru. Он действует 10 минут.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Код из письма"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(shopApi.verifyCode).toHaveBeenCalledWith("nikita@nsbtea.ru", "123456");
    expect(navigate).toHaveBeenCalledWith("/cart");
  });

  it("неверная почта — подсказка без запроса", async () => {
    render(<LoginForm next="/account" navigate={navigate} />);
    await userEvent.type(screen.getByLabelText("Почта"), "nikita");
    await userEvent.click(screen.getByRole("button", { name: "Получить код" }));
    expect(screen.getByText("Проверьте адрес почты")).toBeInTheDocument();
    expect(shopApi.requestCode).not.toHaveBeenCalled();
  });

  it("неверный код — текст сервера, можно ввести снова", async () => {
    vi.mocked(shopApi.requestCode).mockResolvedValue({ ok: true, message: "Отправили код" });
    vi.mocked(shopApi.verifyCode).mockRejectedValue(new ApiError(400, "Неверный код. Осталось попыток: 4", "invalid_code"));
    render(<LoginForm next="/account" navigate={navigate} />);
    await userEvent.type(screen.getByLabelText("Почта"), "a@b.ru");
    await userEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await userEvent.type(await screen.findByLabelText("Код из письма"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Неверный код. Осталось попыток: 4");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Другая почта" })).toBeInTheDocument();
  });

  it("адрес возврата — только внутри сайта", async () => {
    vi.mocked(shopApi.requestCode).mockResolvedValue({ ok: true, message: "ok" });
    vi.mocked(shopApi.verifyCode).mockResolvedValue({ ok: true });
    render(<LoginForm next="https://evil.example/" navigate={navigate} />);
    await userEvent.type(screen.getByLabelText("Почта"), "a@b.ru");
    await userEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await userEvent.type(await screen.findByLabelText("Код из письма"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(navigate).toHaveBeenCalledWith("/account");
  });
});
