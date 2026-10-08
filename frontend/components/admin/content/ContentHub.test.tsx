import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithAdmin } from "@/tests/admin";

import { ContentHub } from "./ContentHub";

describe("ContentHub — раздел «Сайт: страницы и события»", () => {
  it("три понятных входа с пояснениями", () => {
    renderWithAdmin(<ContentHub />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Сайт: страницы и события" }),
    ).toBeInTheDocument();
    const pages = screen.getByRole("link", { name: /^Страницы/ });
    expect(pages).toHaveAttribute("href", "/admin/content/pages");
    expect(pages).toHaveTextContent(/доставка/i);
    expect(screen.getByRole("link", { name: /^Главная страница/ })).toHaveAttribute(
      "href",
      "/admin/content/home",
    );
    expect(screen.getByRole("link", { name: /^События/ })).toHaveAttribute(
      "href",
      "/admin/content/events",
    );
  });

  it("сотрудник с правом «Сайт» тоже видит раздел", () => {
    renderWithAdmin(<ContentHub />, { owner: false, permissions: ["content"] });
    expect(screen.getByRole("link", { name: /^События/ })).toBeInTheDocument();
  });

  it("без права «Сайт» — понятное объяснение вместо раздела", () => {
    renderWithAdmin(<ContentHub />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Главная страница/ })).not.toBeInTheDocument();
  });
});
