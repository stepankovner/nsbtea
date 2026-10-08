import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventsApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { EventCreate, EventEditor } from "./EventEditor";
import { adminEvent } from "./fixtures";

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => search,
  usePathname: () => "/admin/content/events/new",
}));
vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return {
    ...actual,
    eventsApi: { get: vi.fn(), create: vi.fn(), patch: vi.fn(), archive: vi.fn() },
  };
});
vi.mock("@/lib/admin/media", () => ({ uploadMedia: vi.fn(), MAX_UPLOAD_MB: 15 }));
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn().mockResolvedValue([]) }));

async function fillBasics() {
  await userEvent.click(screen.getByRole("radio", { name: "Сплав на сапах" }));
  await userEvent.type(screen.getByLabelText("Название события"), "Сплав по Клязьме");
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-15" } });
  fireEvent.change(screen.getByLabelText("Время начала"), { target: { value: "19:00" } });
  await userEvent.type(screen.getByLabelText("Место"), "Клязьма, лодочная станция");
}

// много полей формы набираются посимвольно: под нагрузкой полного прогона 5 с бывает мало
describe("EventCreate — новое событие", { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
  });

  it("опубликовать: время по Москве уходит в UTC, цена — в копейках", async () => {
    vi.mocked(eventsApi.create).mockResolvedValue(adminEvent({ id: "e-new" }));
    renderWithAdmin(<EventCreate />);
    await fillBasics();
    await userEvent.type(screen.getByLabelText("Цена"), "3500");
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText("Сколько мест"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(eventsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "rafting",
        title: "Сплав по Клязьме",
        starts_at: "2026-10-15T16:00:00.000Z",
        place: "Клязьма, лодочная станция",
        price_kop: 350_000,
        seats_total: 8,
        is_published: true,
      }),
    );
    expect(replace).toHaveBeenCalledWith("/admin/content/events/e-new");
  });

  it("сохранить черновик — на сайте пока не видно", async () => {
    vi.mocked(eventsApi.create).mockResolvedValue(adminEvent({ id: "e-new", is_published: false }));
    renderWithAdmin(<EventCreate />);
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    expect(eventsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ is_published: false, price_kop: null, seats_total: null }),
    );
  });

  it("без названия и даты — не отправляем, объясняем", async () => {
    renderWithAdmin(<EventCreate />);
    await userEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(screen.getByText("Введите название события")).toBeInTheDocument();
    expect(screen.getByText("Укажите дату и время начала")).toBeInTheDocument();
    expect(eventsApi.create).not.toHaveBeenCalled();
  });

  it("окончание раньше начала — ошибка", async () => {
    renderWithAdmin(<EventCreate />);
    await fillBasics();
    fireEvent.change(screen.getByLabelText("Время окончания"), { target: { value: "18:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(screen.getByText(/позже начала/)).toBeInTheDocument();
    expect(eventsApi.create).not.toHaveBeenCalled();
  });

  it("копия события: всё как в исходном, кроме даты", async () => {
    search = new URLSearchParams("copy=e1");
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    renderWithAdmin(<EventCreate />);
    expect(await screen.findByLabelText("Название события")).toHaveValue("Сплав по Клязьме");
    expect(eventsApi.get).toHaveBeenCalledWith("e1");
    expect(screen.getByLabelText("Место")).toHaveValue("Клязьма, лодочная станция");
    expect(screen.getByLabelText("Дата")).toHaveValue("");
  });
});

describe("EventEditor — изменить событие", { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
  });

  it("время показываем по Москве; сохраняем изменения", async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    vi.mocked(eventsApi.patch).mockResolvedValue(adminEvent({ place: "Пляж у моста" }));
    renderWithAdmin(<EventEditor id="e1" />);
    expect(await screen.findByLabelText("Дата")).toHaveValue("2026-10-15");
    expect(screen.getByLabelText("Время начала")).toHaveValue("19:00");
    expect(screen.getByLabelText("Цена")).toHaveValue("3500");
    const place = screen.getByLabelText("Место");
    await userEvent.clear(place);
    await userEvent.type(place, "Пляж у моста");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(eventsApi.patch).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({
        place: "Пляж у моста",
        title: "Сплав по Клязьме",
        starts_at: "2026-10-15T16:00:00.000Z",
      }),
    );
  });

  it("записались и заявки — видно сразу", async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    renderWithAdmin(<EventEditor id="e1" />);
    expect(await screen.findByText(/Записались 3 из 8/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Заявки/ })).toHaveAttribute(
      "href",
      "/admin/applications?type=event",
    );
  });

  it("скрыть с сайта — сразу сохраняется", async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    vi.mocked(eventsApi.patch).mockResolvedValue(adminEvent({ is_published: false }));
    renderWithAdmin(<EventEditor id="e1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Скрыть с сайта" }));
    expect(eventsApi.patch).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ is_published: false }),
    );
    expect(await screen.findByRole("button", { name: "Показать на сайте" })).toBeInTheDocument();
  });

  it("предпросмотр — как в расписании на сайте", async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    renderWithAdmin(<EventEditor id="e1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Как это увидит покупатель" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Сплав по Клязьме").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Осталось 5 мест").length).toBeGreaterThan(0);
  });

  it("убрать в архив — с подтверждением", async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    vi.mocked(eventsApi.archive).mockResolvedValue({ ok: true });
    renderWithAdmin(<EventEditor id="e1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Убрать в архив" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/пропадёт с сайта/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, убрать в архив" }));
    expect(eventsApi.archive).toHaveBeenCalledWith("e1");
    expect(push).toHaveBeenCalledWith("/admin/content/events");
  });

  it("ссылки: открыть на сайте и создать копию", async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(adminEvent());
    renderWithAdmin(<EventEditor id="e1" />);
    expect(await screen.findByRole("link", { name: /Открыть на сайте/ })).toHaveAttribute(
      "href",
      "/events/splav-po-klyazme",
    );
    expect(screen.getByRole("link", { name: /Создать копию/ })).toHaveAttribute(
      "href",
      "/admin/content/events/new?copy=e1",
    );
  });
});
