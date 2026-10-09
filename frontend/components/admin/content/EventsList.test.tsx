import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventsApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { EventsList } from "./EventsList";
import { adminEvent } from "./fixtures";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/content/events",
}));
vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return { ...actual, eventsApi: { list: vi.fn(), restore: vi.fn() } };
});

describe("EventsList — события", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
  });

  it("ближайшие события: дата и время по Москве, места, видно ли на сайте", async () => {
    vi.mocked(eventsApi.list).mockResolvedValue([
      adminEvent(),
      adminEvent({
        id: "e2",
        title: "Церемония «Осенние улуны»",
        type: "ceremony",
        type_label: "Церемония",
        is_published: false,
        seats_total: null,
        seats_left: null,
        seats_taken: 0,
      }),
    ]);
    renderWithAdmin(<EventsList />);
    const row = await screen.findByRole("link", { name: /Сплав по Клязьме/ });
    expect(eventsApi.list).toHaveBeenCalledWith("upcoming");
    expect(row).toHaveAttribute("href", "/admin/content/events/e1");
    expect(within(row).getByText(/15 октября, 19:00/)).toBeInTheDocument();
    expect(within(row).getByText("Сплав на сапах")).toBeInTheDocument();
    expect(within(row).getByText("На сайте")).toBeInTheDocument();
    expect(within(row).getByText("Записались 3 из 8")).toBeInTheDocument();
    const hidden = screen.getByRole("link", { name: /Осенние улуны/ });
    expect(within(hidden).getByText("Скрыто")).toBeInTheDocument();
  });

  it("главное действие — новое событие; вкладки ближайшие и прошедшие", async () => {
    vi.mocked(eventsApi.list).mockResolvedValue([adminEvent()]);
    renderWithAdmin(<EventsList />);
    expect(await screen.findByRole("link", { name: "Новое событие" })).toHaveAttribute(
      "href",
      "/admin/content/events/new",
    );
    expect(screen.getByRole("link", { name: "Ближайшие" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Прошедшие/ })).toHaveAttribute(
      "href",
      "/admin/content/events?period=past",
    );
  });

  it("прошедшие — из адреса", async () => {
    search = new URLSearchParams("period=past");
    vi.mocked(eventsApi.list).mockResolvedValue([]);
    renderWithAdmin(<EventsList />);
    expect(await screen.findByText("Прошедших событий пока нет")).toBeInTheDocument();
    expect(eventsApi.list).toHaveBeenCalledWith("past");
  });

  it("нет ближайших — подсказка, что сделать", async () => {
    vi.mocked(eventsApi.list).mockResolvedValue([]);
    renderWithAdmin(<EventsList />);
    expect(await screen.findByText("Ближайших событий нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Добавить событие" })).toHaveAttribute(
      "href",
      "/admin/content/events/new",
    );
  });

  it("архив — отдельной вкладкой", async () => {
    vi.mocked(eventsApi.list).mockResolvedValue([adminEvent()]);
    renderWithAdmin(<EventsList />);
    expect(await screen.findByRole("link", { name: "Архив" })).toHaveAttribute(
      "href",
      "/admin/content/events?period=archived",
    );
    expect(screen.getByRole("link", { name: "Прошедшие" })).toHaveAttribute(
      "href",
      "/admin/content/events?period=past",
    );
  });

  it("архив: «Восстановить» возвращает событие (скрытым с сайта)", async () => {
    search = new URLSearchParams("period=archived");
    vi.mocked(eventsApi.list).mockResolvedValue([adminEvent({ is_published: false })]);
    vi.mocked(eventsApi.restore).mockResolvedValue(adminEvent({ is_published: false }));
    renderWithAdmin(<EventsList />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Восстановить «Сплав по Клязьме»" }),
    );
    expect(eventsApi.list).toHaveBeenCalledWith("archived");
    expect(eventsApi.restore).toHaveBeenCalledWith("e1");
    expect(screen.getByText(/вернётся скрытым/)).toBeInTheDocument();
  });

  it("пустой архив — объясняем", async () => {
    search = new URLSearchParams("period=archived");
    vi.mocked(eventsApi.list).mockResolvedValue([]);
    renderWithAdmin(<EventsList />);
    expect(await screen.findByText("В архиве пусто")).toBeInTheDocument();
  });

  it("без права «Сайт» — не показываем", () => {
    renderWithAdmin(<EventsList />, { owner: false, permissions: ["applications"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(eventsApi.list).not.toHaveBeenCalled();
  });
});
