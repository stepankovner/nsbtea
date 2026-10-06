import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CookieBar } from "./CookieBar";

describe("CookieBar — ненавязчивая полоска, не модальное окно", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("показывается, пока не нажали «Понятно», и не блокирует страницу", async () => {
    render(<CookieBar />);
    const bar = await screen.findByRole("region", { name: "Файлы cookie" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bar).toHaveTextContent("cookie");
    await userEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(screen.queryByRole("region", { name: "Файлы cookie" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("nsb_cookie_ok")).toBe("1");
  });

  it("после согласия больше не появляется", () => {
    window.localStorage.setItem("nsb_cookie_ok", "1");
    render(<CookieBar />);
    expect(screen.queryByRole("region", { name: "Файлы cookie" })).not.toBeInTheDocument();
  });
});
