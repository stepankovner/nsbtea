import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pagesApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { adminPage } from "./fixtures";
import { PagesList } from "./PagesList";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/content/pages",
}));
vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return { ...actual, pagesApi: { list: vi.fn(), restore: vi.fn() } };
});

const pages = [
  adminPage(),
  adminPage({ id: "p-club", title: "Чайный клуб", slug: "club", is_published: false }),
  adminPage({ id: "p-gongfu", title: "Пролив (гунфу ча)", slug: "gongfu", kind: "guide" }),
  adminPage({
    id: "p-offer",
    title: "Публичная оферта",
    slug: "offer",
    kind: "legal",
    is_published: false,
    required: true,
  }),
  adminPage({
    id: "p-privacy",
    title: "Политика обработки персональных данных",
    slug: "privacy",
    kind: "legal",
    required: true,
  }),
];

describe("PagesList — страницы сайта", () => {
  beforeEach(() => vi.clearAllMocks());

  it("страницы по группам: магазин, как заваривать, документы", async () => {
    search = new URLSearchParams();
    vi.mocked(pagesApi.list).mockResolvedValue(pages);
    renderWithAdmin(<PagesList />);
    expect(await screen.findByRole("heading", { name: "Страницы магазина" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Как заваривать" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Документы" })).toBeInTheDocument();
    expect(pagesApi.list).toHaveBeenCalledWith(false);

    const about = screen.getByRole("link", { name: /О магазине/ });
    expect(about).toHaveAttribute("href", "/admin/content/pages/p1");
    expect(within(about).getByText("На сайте")).toBeInTheDocument();
    expect(within(about).getByText("/about")).toBeInTheDocument();

    const club = screen.getByRole("link", { name: /Чайный клуб/ });
    expect(within(club).getByText("Черновик")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Пролив/ })).getByText("/guides/gongfu"),
    ).toBeInTheDocument();
  });

  it("неопубликованный обязательный документ — предупреждение", async () => {
    search = new URLSearchParams();
    vi.mocked(pagesApi.list).mockResolvedValue(pages);
    renderWithAdmin(<PagesList />);
    const offer = await screen.findByRole("link", { name: /Публичная оферта/ });
    expect(within(offer).getByText(/без него нельзя запускать магазин/)).toBeInTheDocument();
    const privacy = screen.getByRole("link", { name: /Политика обработки/ });
    expect(within(privacy).queryByText(/нельзя запускать/)).not.toBeInTheDocument();
  });

  it("главное действие — новая страница; есть архив", async () => {
    search = new URLSearchParams();
    vi.mocked(pagesApi.list).mockResolvedValue(pages);
    renderWithAdmin(<PagesList />);
    expect(await screen.findByRole("link", { name: "Новая страница" })).toHaveAttribute(
      "href",
      "/admin/content/pages/new",
    );
    expect(screen.getByRole("link", { name: /Архив/ })).toHaveAttribute(
      "href",
      "/admin/content/pages?archived=1",
    );
  });

  it("архив: страницу можно восстановить", async () => {
    search = new URLSearchParams("archived=1");
    const old = adminPage({
      id: "p-old",
      title: "Летняя акция",
      slug: "leto",
      is_published: false,
    });
    vi.mocked(pagesApi.list).mockResolvedValue([old]);
    vi.mocked(pagesApi.restore).mockResolvedValue(old);
    renderWithAdmin(<PagesList />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Восстановить «Летняя акция»" }),
    );
    expect(pagesApi.list).toHaveBeenCalledWith(true);
    expect(pagesApi.restore).toHaveBeenCalledWith("p-old");
  });

  it("пустой архив — объясняем", async () => {
    search = new URLSearchParams("archived=1");
    vi.mocked(pagesApi.list).mockResolvedValue([]);
    renderWithAdmin(<PagesList />);
    expect(await screen.findByText("В архиве пусто")).toBeInTheDocument();
  });

  it("нет страниц — подсказка, что сделать", async () => {
    search = new URLSearchParams();
    vi.mocked(pagesApi.list).mockResolvedValue([]);
    renderWithAdmin(<PagesList />);
    expect(await screen.findByText("Пока нет страниц")).toBeInTheDocument();
  });

  it("без права «Сайт» — список не запрашиваем", () => {
    search = new URLSearchParams();
    renderWithAdmin(<PagesList />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(pagesApi.list).not.toHaveBeenCalled();
  });
});
