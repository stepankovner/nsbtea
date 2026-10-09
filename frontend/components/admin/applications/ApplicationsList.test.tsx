import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applicationsApi } from "@/lib/admin/applications";
import { renderWithAdmin } from "@/tests/admin";

import { ApplicationsList } from "./ApplicationsList";
import { application, applicationList, eventApplication } from "./fixtures";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/applications",
}));
vi.mock("@/lib/admin/applications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/applications")>();
  return { ...actual, applicationsApi: { list: vi.fn() } };
});

describe("ApplicationsList — заявки", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
  });

  it("единый список: кто, что хочет, когда, статус текстом", async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue(
      applicationList([
        application(),
        eventApplication({ status: "in_progress", status_label: "В работе" }),
      ]),
    );
    renderWithAdmin(<ApplicationsList />);
    const row = await screen.findByRole("link", { name: /Олег/ });
    expect(row).toHaveAttribute("href", "/admin/applications/a1");
    expect(within(row).getByText("Опт")).toBeInTheDocument();
    expect(within(row).getByText("Новая")).toBeInTheDocument();
    expect(within(row).getByText(/Кофейня «Ромашка»/)).toBeInTheDocument();
    expect(within(row).getByText(/7 октября, 12:30/)).toBeInTheDocument();

    const ira = screen.getByRole("link", { name: /Ира/ });
    expect(within(ira).getByText("Запись на событие")).toBeInTheDocument();
    expect(within(ira).getByText(/Сплав по Клязьме/)).toBeInTheDocument();
    expect(within(ira).getByText("В работе")).toBeInTheDocument();
  });

  it("фильтр по статусу (с количеством) и по виду заявки", async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue(applicationList());
    renderWithAdmin(<ApplicationsList />);
    const statuses = await screen.findByRole("navigation", { name: "Статус заявки" });
    expect(within(statuses).getByRole("link", { name: /Новые\s*1/ })).toHaveAttribute(
      "href",
      "/admin/applications?status=new",
    );
    expect(within(statuses).getByRole("link", { name: /В работе\s*2/ })).toHaveAttribute(
      "href",
      "/admin/applications?status=in_progress",
    );
    expect(within(statuses).getByRole("link", { name: /Закрытые\s*5/ })).toHaveAttribute(
      "href",
      "/admin/applications?status=closed",
    );
    const types = screen.getByRole("navigation", { name: "Вид заявки" });
    expect(within(types).getByRole("link", { name: "Опт" })).toHaveAttribute(
      "href",
      "/admin/applications?type=wholesale",
    );
    expect(within(types).getByRole("link", { name: "Индивидуальная церемония" })).toHaveAttribute(
      "href",
      "/admin/applications?type=private_ceremony",
    );
  });

  it("фильтры из адреса уходят в запрос", async () => {
    search = new URLSearchParams("status=new&type=event");
    vi.mocked(applicationsApi.list).mockResolvedValue(applicationList([]));
    renderWithAdmin(<ApplicationsList />);
    expect(await screen.findByText("Ничего не нашлось")).toBeInTheDocument();
    expect(applicationsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "new", type: "event", page: 1 }),
    );
  });

  it("заявки одного события: фильтр виден, его можно снять", async () => {
    search = new URLSearchParams("event_id=e1");
    vi.mocked(applicationsApi.list).mockResolvedValue(applicationList([eventApplication()]));
    renderWithAdmin(<ApplicationsList />);
    const banner = await screen.findByRole("status", { name: "Фильтр по событию" });
    expect(banner).toHaveTextContent("Сплав по Клязьме");
    expect(applicationsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: "e1", page: 1 }),
    );
    expect(within(banner).getByRole("link", { name: "Показать все заявки" })).toHaveAttribute(
      "href",
      "/admin/applications",
    );
    // остальные фильтры не сбрасывают выбранное событие
    expect(
      within(screen.getByRole("navigation", { name: "Статус заявки" })).getByRole("link", {
        name: /Новые/,
      }),
    ).toHaveAttribute("href", "/admin/applications?event_id=e1&status=new");
  });

  it("на событие ещё никто не записался — так и говорим", async () => {
    search = new URLSearchParams("event_id=e1");
    vi.mocked(applicationsApi.list).mockResolvedValue({ items: [], total: 0, counts: {} });
    renderWithAdmin(<ApplicationsList />);
    expect(await screen.findByText("На это событие заявок нет")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Показать все заявки" })).toHaveAttribute(
      "href",
      "/admin/applications",
    );
  });

  it("пусто — объясняем, откуда берутся заявки", async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue({ items: [], total: 0, counts: {} });
    renderWithAdmin(<ApplicationsList />);
    expect(await screen.findByText("Пока нет заявок")).toBeInTheDocument();
    expect(screen.getByText(/придёт сообщение в Telegram/)).toBeInTheDocument();
  });

  it("сотрудник с правом «Заявки» видит список, без права — нет", async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue(applicationList());
    const { unmount } = renderWithAdmin(<ApplicationsList />, {
      owner: false,
      permissions: ["applications"],
    });
    expect(await screen.findByRole("link", { name: /Олег/ })).toBeInTheDocument();
    unmount();
    vi.clearAllMocks();
    renderWithAdmin(<ApplicationsList />, { owner: false, permissions: ["content"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(applicationsApi.list).not.toHaveBeenCalled();
  });
});
