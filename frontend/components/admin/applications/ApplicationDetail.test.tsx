import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applicationsApi } from "@/lib/admin/applications";
import { renderWithAdmin } from "@/tests/admin";

import { ApplicationDetail } from "./ApplicationDetail";
import { application, eventApplication } from "./fixtures";

vi.mock("@/lib/admin/applications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/applications")>();
  return { ...actual, applicationsApi: { get: vi.fn(), patch: vi.fn() } };
});

describe("ApplicationDetail — карточка заявки", () => {
  beforeEach(() => vi.clearAllMocks());

  it("кто, как связаться и что хочет", async () => {
    vi.mocked(applicationsApi.get).mockResolvedValue(application());
    renderWithAdmin(<ApplicationDetail id="a1" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Олег/ })).toBeInTheDocument();
    expect(screen.getByText(/Опт · 7 октября 2026, 12:30/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+7 900 123-45-67" })).toHaveAttribute(
      "href",
      "tel:+79001234567",
    );
    expect(screen.getByRole("link", { name: "oleg@example.ru" })).toHaveAttribute(
      "href",
      "mailto:oleg@example.ru",
    );
    const wants = screen.getByRole("region", { name: "Что хочет" });
    expect(within(wants).getByText("Организация")).toBeInTheDocument();
    expect(within(wants).getByText("Кофейня «Ромашка»")).toBeInTheDocument();
    expect(within(wants).getByText("Объём в месяц")).toBeInTheDocument();
    expect(within(wants).getByText("Пришлите прайс на пуэры")).toBeInTheDocument();
  });

  it("Telegram — ссылкой; запись на событие — со ссылкой на событие", async () => {
    vi.mocked(applicationsApi.get).mockResolvedValue(eventApplication());
    renderWithAdmin(<ApplicationDetail id="a2" />);
    expect(await screen.findByRole("link", { name: "@ira_tea" })).toHaveAttribute(
      "href",
      "https://t.me/ira_tea",
    );
    expect(screen.getByRole("link", { name: "Сплав по Клязьме" })).toHaveAttribute(
      "href",
      "/admin/content/events/e1",
    );
    expect(screen.getByText("Гостей")).toBeInTheDocument();
  });

  it("статус — крупными кнопками, текущий отмечен", async () => {
    vi.mocked(applicationsApi.get).mockResolvedValue(application());
    vi.mocked(applicationsApi.patch).mockResolvedValue(
      application({ status: "in_progress", status_label: "В работе" }),
    );
    renderWithAdmin(<ApplicationDetail id="a1" />);
    const group = await screen.findByRole("group", { name: "Статус заявки" });
    expect(within(group).getByRole("button", { name: /Новая/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(group).getByRole("button", { name: /В работе/ }));
    expect(applicationsApi.patch).toHaveBeenCalledWith("a1", { status: "in_progress" });
    expect(await within(group).findByRole("button", { name: /В работе/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("комментарий сотрудника сохраняется", async () => {
    vi.mocked(applicationsApi.get).mockResolvedValue(application());
    vi.mocked(applicationsApi.patch).mockResolvedValue(
      application({ admin_comment: "Отправил прайс" }),
    );
    renderWithAdmin(<ApplicationDetail id="a1" />);
    await userEvent.type(await screen.findByLabelText("Комментарий для себя"), "Отправил прайс");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить комментарий" }));
    expect(applicationsApi.patch).toHaveBeenCalledWith("a1", { admin_comment: "Отправил прайс" });
  });

  it("запись на событие можно отменить — место освободится", async () => {
    vi.mocked(applicationsApi.get).mockResolvedValue(eventApplication());
    vi.mocked(applicationsApi.patch).mockResolvedValue(
      eventApplication({ status: "cancelled", status_label: "Отменена" }),
    );
    renderWithAdmin(<ApplicationDetail id="a2" />);
    await userEvent.click(await screen.findByRole("button", { name: "Отменить запись" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/освободятся/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, отменить запись" }));
    expect(applicationsApi.patch).toHaveBeenCalledWith("a2", { status: "cancelled" });
  });

  it("без права «Заявки» — не показываем", () => {
    renderWithAdmin(<ApplicationDetail id="a1" />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(applicationsApi.get).not.toHaveBeenCalled();
  });
});
