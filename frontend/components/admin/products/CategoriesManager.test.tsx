import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { categoriesApi } from "@/lib/admin/categories";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { CategoriesManager } from "./CategoriesManager";
import { categoriesTree, category } from "./fixtures";

vi.mock("@/lib/admin/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/categories")>();
  return {
    ...actual,
    categoriesApi: { list: vi.fn(), create: vi.fn(), patch: vi.fn(), reorder: vi.fn(), archive: vi.fn(), restore: vi.fn() },
  };
});
vi.mock("@/lib/admin/media", () => ({ uploadMedia: vi.fn(), MAX_UPLOAD_MB: 15 }));

const archived = [category({ id: "c4", name: "Белый", slug: "belyi", archived_at: "2026-10-01T10:00:00Z" })];

beforeEach(() => {
  vi.mocked(categoriesApi.list).mockImplementation(async (archivedOnly?: boolean) => (archivedOnly ? archived : categoriesTree));
});

describe("CategoriesManager — категории каталога", () => {
  it("дерево: основные категории и подкатегории, сколько в них товаров", async () => {
    renderWithAdmin(<CategoriesManager />);
    expect(await screen.findByText("Пуэр")).toBeInTheDocument();
    expect(screen.getByText("Шу пуэр")).toBeInTheDocument();
    expect(screen.getByText("12 товаров")).toBeInTheDocument();
    expect(screen.getByText("4 товара")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Товары/ })).toHaveAttribute("href", "/admin/products");
  });

  it("создать категорию — главной кнопкой", async () => {
    vi.mocked(categoriesApi.create).mockResolvedValue(category({ id: "c5", name: "Белый" }));
    renderWithAdmin(<CategoriesManager />);
    await screen.findByText("Пуэр");
    await userEvent.click(screen.getByRole("button", { name: "Добавить категорию" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Название/ }), "Белый");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(categoriesApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Белый", parent_id: null }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("подкатегория — внутри основной", async () => {
    vi.mocked(categoriesApi.create).mockResolvedValue(category({ id: "c13", name: "Дикий пуэр", parent_id: "c1" }));
    renderWithAdmin(<CategoriesManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить подкатегорию в «Пуэр»" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Название/ }), "Дикий пуэр");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(categoriesApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Дикий пуэр", parent_id: "c1" }));
  });

  it("переименовать — уходят только изменения", async () => {
    vi.mocked(categoriesApi.patch).mockResolvedValue(category({ id: "c2", name: "Улуны" }));
    renderWithAdmin(<CategoriesManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Изменить «Улун»" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByRole("textbox", { name: /^Название/ });
    expect(name).toHaveValue("Улун");
    await userEvent.clear(name);
    await userEvent.type(name, "Улуны");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(categoriesApi.patch).toHaveBeenCalledWith("c2", { name: "Улуны" });
  });

  it("порядок — внутри своего уровня", async () => {
    vi.mocked(categoriesApi.reorder).mockResolvedValue({ ok: true } as never);
    renderWithAdmin(<CategoriesManager />);
    expect(await screen.findByRole("button", { name: "Переместить «Пуэр» выше" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Переместить «Улун» выше" }));
    expect(categoriesApi.reorder).toHaveBeenCalledWith(["c2", "c1", "c3"]);
    await userEvent.click(screen.getByRole("button", { name: "Переместить «Шу пуэр» ниже" }));
    expect(categoriesApi.reorder).toHaveBeenLastCalledWith(["c12", "c11"]);
  });

  it("в архив — с объяснением; если в категории есть товары, сервер объяснит", async () => {
    vi.mocked(categoriesApi.archive).mockRejectedValue(
      new ApiError(409, "В категории есть товары (4). Перенесите их в другую категорию или уберите в архив, затем повторите.", "conflict"),
    );
    renderWithAdmin(<CategoriesManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Убрать в архив «Улун»" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Вернуть можно/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Убрать в архив" }));
    expect(categoriesApi.archive).toHaveBeenCalledWith("c2");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("В категории есть товары (4)");
  });

  it("архив: восстановить", async () => {
    vi.mocked(categoriesApi.restore).mockResolvedValue({ ok: true } as never);
    renderWithAdmin(<CategoriesManager />);
    await screen.findByText("Пуэр");
    await userEvent.click(screen.getByRole("button", { name: "Архив" }));
    await userEvent.click(await screen.findByRole("button", { name: "Восстановить «Белый»" }));
    expect(categoriesApi.list).toHaveBeenCalledWith(true);
    expect(categoriesApi.restore).toHaveBeenCalledWith("c4");
  });

  it("пусто — подсказка, с чего начать", async () => {
    vi.mocked(categoriesApi.list).mockResolvedValue([]);
    renderWithAdmin(<CategoriesManager />);
    expect(await screen.findByText("Пока нет категорий")).toBeInTheDocument();
  });
});
