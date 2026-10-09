import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { homeApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { homeBlocks } from "./fixtures";
import { HomeBlocks } from "./HomeBlocks";

vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return { ...actual, homeApi: { list: vi.fn(), patch: vi.fn(), reorder: vi.fn() } };
});

function rows() {
  return screen.getAllByRole("listitem").map((li) => within(li).getByRole("heading").textContent);
}

describe("HomeBlocks — блоки главной страницы", () => {
  beforeEach(() => vi.clearAllMocks());

  it("блоки по порядку; видно, что показано, а что скрыто", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    renderWithAdmin(<HomeBlocks />);
    expect(await screen.findByRole("heading", { name: "Главный баннер" })).toBeInTheDocument();
    expect(rows()).toEqual(["Главный баннер", "Чай недели", "Преимущества"]);
    const advantages = screen.getAllByRole("listitem")[2]!;
    expect(within(advantages).getByText("Скрыт")).toBeInTheDocument();
    expect(
      within(screen.getAllByRole("listitem")[0]!).getByRole("link", { name: "Изменить" }),
    ).toHaveAttribute("href", "/admin/content/home/hero");
    expect(screen.getByRole("link", { name: /Открыть главную/ })).toHaveAttribute("href", "/");
  });

  it("показать или скрыть блок — одним переключателем", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    vi.mocked(homeApi.patch).mockResolvedValue({ ...homeBlocks()[2]!, is_visible: true });
    renderWithAdmin(<HomeBlocks />);
    const toggle = await screen.findByRole("switch", {
      name: "Показывать на главной: Преимущества",
    });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(homeApi.patch).toHaveBeenCalledWith("advantages", { is_visible: true });
  });

  it("порядок — кнопками «выше» и «ниже» (удобно с телефона)", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    vi.mocked(homeApi.reorder).mockResolvedValue({ ok: true });
    renderWithAdmin(<HomeBlocks />);
    expect(await screen.findByRole("button", { name: "Выше: Главный баннер" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ниже: Преимущества" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Ниже: Главный баннер" }));
    expect(homeApi.reorder).toHaveBeenCalledWith(["thursday", "hero", "advantages"]);
    await waitFor(() => expect(rows()).toEqual(["Чай недели", "Главный баннер", "Преимущества"]));
  });

  it("перетаскивание — за ручку с понятной подписью", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    renderWithAdmin(<HomeBlocks />);
    expect(
      await screen.findByRole("button", { name: "Перетащить: Главный баннер" }),
    ).toBeInTheDocument();
  });

  it("порядок не сохранился — возвращаем как было", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    vi.mocked(homeApi.reorder).mockRejectedValue(new Error("сеть"));
    renderWithAdmin(<HomeBlocks />);
    await userEvent.click(await screen.findByRole("button", { name: "Выше: Чай недели" }));
    await waitFor(() => expect(rows()).toEqual(["Главный баннер", "Чай недели", "Преимущества"]));
  });

  it("без права «Сайт» — не показываем", () => {
    renderWithAdmin(<HomeBlocks />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(homeApi.list).not.toHaveBeenCalled();
  });
});
