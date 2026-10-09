import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { homeApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { homeBlocks } from "./fixtures";
import { HomeBlockEditor } from "./HomeBlockEditor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/content/home/hero",
}));
vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return { ...actual, homeApi: { list: vi.fn(), patch: vi.fn(), reorder: vi.fn() } };
});
vi.mock("@/lib/admin/media", () => ({ uploadMedia: vi.fn(), MAX_UPLOAD_MB: 15 }));
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn().mockResolvedValue([]) }));

describe("HomeBlockEditor — содержимое блока главной", { timeout: 15_000 }, () => {
  beforeEach(() => vi.clearAllMocks());

  it("баннер: меняем заголовок — сохраняем блок целиком, ничего не теряя", async () => {
    const blocks = homeBlocks();
    vi.mocked(homeApi.list).mockResolvedValue(blocks);
    vi.mocked(homeApi.patch).mockResolvedValue(blocks[0]!);
    renderWithAdmin(<HomeBlockEditor kind="hero" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Главный баннер" }),
    ).toBeInTheDocument();
    const line1 = screen.getByLabelText("Заголовок, первая строка");
    expect(line1).toHaveValue("Китайский чай");
    await userEvent.clear(line1);
    await userEvent.type(line1, "Чай с характером");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить блок" }));
    expect(homeApi.patch).toHaveBeenCalledWith("hero", {
      data: { ...blocks[0]!.data, title_line1: "Чай с характером" },
    });
  });

  it("ссылка кнопки — только адрес сайта или https://", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    renderWithAdmin(<HomeBlockEditor kind="hero" />);
    const href = await screen.findByLabelText("Главная кнопка: куда ведёт");
    await userEvent.clear(href);
    await userEvent.type(href, "catalog");
    expect(screen.getByText(/начинаться с \//)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить блок" })).toBeDisabled();
  });

  it("преимущества: добавить и убрать карточку", async () => {
    const blocks = homeBlocks();
    vi.mocked(homeApi.list).mockResolvedValue(blocks);
    vi.mocked(homeApi.patch).mockResolvedValue(blocks[2]!);
    renderWithAdmin(<HomeBlockEditor kind="advantages" />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить карточку" }));
    const third = screen.getByRole("group", { name: "Карточка 3" });
    await userEvent.type(within(third).getByLabelText("Заголовок карточки"), "Свежий чай");
    await userEvent.click(screen.getByRole("button", { name: "Убрать карточку 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить блок" }));
    expect(homeApi.patch).toHaveBeenCalledWith("advantages", {
      data: {
        title: "Почему у нас",
        items: [
          { title: "Баллы за покупки", text: "5% возвращаются баллами." },
          { title: "Свежий чай", text: "" },
        ],
      },
    });
  });

  it("чай недели: товары выбираются в «Акциях» — объясняем и даём ссылку", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    renderWithAdmin(<HomeBlockEditor kind="thursday" />);
    expect(await screen.findByRole("link", { name: /Акции/ })).toHaveAttribute(
      "href",
      "/admin/promotions",
    );
  });

  it("предпросмотр — как на сайте, с несохранёнными правками", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    renderWithAdmin(<HomeBlockEditor kind="hero" />);
    const line2 = await screen.findByLabelText("Заголовок, вторая строка");
    await userEvent.clear(line2);
    await userEvent.type(line2, "с доставкой");
    await userEvent.click(screen.getByRole("button", { name: "Как это увидит покупатель" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("с доставкой")).toBeInTheDocument());
  });

  it("«Сейчас в наличии»: выбрано больше, чем показываем, — подсказка, а не запрет", async () => {
    vi.mocked(homeApi.list).mockResolvedValue([
      {
        kind: "featured",
        label: "Сейчас в наличии",
        data: {
          title: "Сейчас в наличии",
          product_ids: ["p1", "p2", "p3", "p4", "p5", "p6"],
          limit: 4,
        },
        images: {},
        sort_order: 0,
        is_visible: true,
      },
    ]);
    vi.mocked(homeApi.patch).mockResolvedValue(homeBlocks()[0]!);
    renderWithAdmin(<HomeBlockEditor kind="featured" />);
    expect(await screen.findByText(/покажутся первые 4/)).toBeInTheDocument();
    const title = screen.getByLabelText("Заголовок блока");
    await userEvent.type(title, "!");
    const save = screen.getByRole("button", { name: "Сохранить блок" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(homeApi.patch).toHaveBeenCalledWith(
      "featured",
      expect.objectContaining({ data: expect.objectContaining({ title: "Сейчас в наличии!" }) }),
    );
  });

  it("неизвестный блок — понятное сообщение", async () => {
    vi.mocked(homeApi.list).mockResolvedValue(homeBlocks());
    renderWithAdmin(<HomeBlockEditor kind="banner-x" />);
    expect(await screen.findByText("Такого блока нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Все блоки/ })).toHaveAttribute(
      "href",
      "/admin/content/home",
    );
  });
});
