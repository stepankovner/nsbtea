import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pagesApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { adminPage } from "./fixtures";
import { PageCreate } from "./PageCreate";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/content/pages/new",
}));
vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return { ...actual, pagesApi: { create: vi.fn() } };
});

describe("PageCreate — новая страница", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
  });

  it("вид и название — создаём черновик и открываем редактор", async () => {
    vi.mocked(pagesApi.create).mockResolvedValue(adminPage({ id: "p-new", title: "Как заваривать пуэр", slug: "kak-zavarivat-puer", kind: "guide", is_published: false }));
    renderWithAdmin(<PageCreate />);
    await userEvent.click(screen.getByRole("radio", { name: "Как заваривать" }));
    await userEvent.type(screen.getByLabelText("Название страницы"), "Как заваривать пуэр");
    // адрес подсказываем из названия — его можно не заполнять
    expect(screen.getByLabelText("Адрес страницы")).toHaveAttribute("placeholder", "kak-zavarivat-puer");
    expect(screen.getByText("/guides/")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    expect(pagesApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Как заваривать пуэр", kind: "guide", slug: null, is_published: false }),
    );
    expect(replace).toHaveBeenCalledWith("/admin/content/pages/p-new");
  });

  it("свой адрес — уходит на сервер", async () => {
    vi.mocked(pagesApi.create).mockResolvedValue(adminPage({ id: "p-new" }));
    renderWithAdmin(<PageCreate />);
    await userEvent.type(screen.getByLabelText("Название страницы"), "Наш чайный клуб");
    await userEvent.type(screen.getByLabelText("Адрес страницы"), "club");
    await userEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    expect(pagesApi.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Наш чайный клуб", kind: "page", slug: "club" }));
  });

  it("без названия и с кириллицей в адресе — не отправляем, объясняем", async () => {
    renderWithAdmin(<PageCreate />);
    await userEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    expect(screen.getByText("Введите название страницы")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название страницы"), "О нас");
    await userEvent.type(screen.getByLabelText("Адрес страницы"), "о-нас");
    await userEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    expect(screen.getByText(/только латиница/)).toBeInTheDocument();
    expect(pagesApi.create).not.toHaveBeenCalled();
  });

  it("вид можно выбрать заранее ссылкой (?kind=legal)", () => {
    search = new URLSearchParams("kind=legal");
    renderWithAdmin(<PageCreate />);
    expect(screen.getByRole("radio", { name: "Документ" })).toBeChecked();
  });
});
