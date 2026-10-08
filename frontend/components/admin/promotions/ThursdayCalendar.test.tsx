import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupProducts } from "@/lib/admin/lookup";
import { promotionsApi } from "@/lib/admin/promotions";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { calendar, lookupOolong, lookupTea, thursday } from "./fixtures";
import { ThursdayCalendar } from "./ThursdayCalendar";

vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));
vi.mock("@/lib/admin/promotions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/promotions")>();
  return { ...actual, promotionsApi: { thursdays: vi.fn(), saveThursday: vi.fn(), clearThursday: vi.fn() } };
});

function mockApi(cal = calendar()) {
  const all = [lookupTea, lookupOolong];
  vi.mocked(lookupProducts).mockImplementation(async (params) => (params.ids ? all.filter((p) => params.ids?.includes(p.id)) : all));
  vi.mocked(promotionsApi.thursdays).mockResolvedValue(cal);
  vi.mocked(promotionsApi.saveThursday).mockResolvedValue({ ok: true });
  vi.mocked(promotionsApi.clearThursday).mockResolvedValue({ ok: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  // «сегодня» — четверг 8 октября 2026, 12:00 по Москве
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ThursdayCalendar — календарь чая недели", () => {
  it("8 ближайших четвергов: сегодняшний отмечен, незапланированные — с предупреждением", async () => {
    mockApi();
    renderWithAdmin(<ThursdayCalendar />);
    const list = await screen.findByRole("list", { name: "Ближайшие четверги" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);

    const today = screen.getByRole("region", { name: /8 октября/ });
    expect(within(today).getByText("Сегодня")).toBeInTheDocument();
    expect(within(today).getByText("Да Хун Пао")).toBeInTheDocument();
    expect(within(today).getByText(/−20%/)).toBeInTheDocument();
    expect(within(today).getByText(/общая скидка/)).toBeInTheDocument();
    // режим «неделя»: с четверга по среду
    expect(within(today).getByText(/с 8 по 14 октября/)).toBeInTheDocument();

    const next = screen.getByRole("region", { name: /15 октября/ });
    expect(within(next).getByText(/−25%/)).toBeInTheDocument();
    expect(within(next).getByText(/своя скидка/)).toBeInTheDocument();
    expect(within(next).getByText(/остатки весеннего урожая/)).toBeInTheDocument();

    expect(screen.getAllByText("Не запланировано — в этот четверг акции не будет")).toHaveLength(6);
  });

  it("ближайший четверг отмечен, если сегодня не четверг", async () => {
    vi.setSystemTime(new Date("2026-10-05T09:00:00Z")); // понедельник
    mockApi();
    renderWithAdmin(<ThursdayCalendar />);
    const first = await screen.findByRole("region", { name: /8 октября/ });
    expect(within(first).getByText("Ближайший")).toBeInTheDocument();
    expect(within(first).queryByText("Сегодня")).not.toBeInTheDocument();
  });

  it("запланировать четверг: выбрать чай, скидка — общая", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<ThursdayCalendar />);
    const card = await screen.findByRole("region", { name: /22 октября/ });
    await user.click(within(card).getByRole("button", { name: "Запланировать" }));
    const save = within(card).getByRole("button", { name: "Сохранить план" });
    expect(save).toBeDisabled();
    await user.click(within(card).getByRole("button", { name: "Добавить товар" }));
    await user.type(screen.getByPlaceholderText("Название товара"), "хун");
    await user.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
    expect(within(card).getByRole("radio", { name: /Общая скидка — 20%/ })).toBeChecked();
    await user.click(save);
    expect(promotionsApi.saveThursday).toHaveBeenCalledWith("2026-10-22", { product_ids: ["p1"], percent: null, note: null });
    // после сохранения календарь перезагружается с сервера
    await vi.waitFor(() => expect(promotionsApi.thursdays).toHaveBeenCalledTimes(2));
  });

  it("свой процент у четверга", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<ThursdayCalendar />);
    const card = await screen.findByRole("region", { name: /8 октября/ });
    await user.click(within(card).getByRole("button", { name: "Изменить" }));
    expect(await within(card).findByText("Да Хун Пао")).toBeInTheDocument();
    await user.click(within(card).getByRole("radio", { name: "Своя скидка" }));
    await user.type(within(card).getByLabelText(/^Своя скидка, %/), "30");
    await user.click(within(card).getByRole("button", { name: "Сохранить план" }));
    expect(promotionsApi.saveThursday).toHaveBeenCalledWith("2026-10-08", { product_ids: ["p1"], percent: 30, note: null });
  });

  it("свой процент вне 1–99 — не сохраняем", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<ThursdayCalendar />);
    const card = await screen.findByRole("region", { name: /15 октября/ });
    await user.click(within(card).getByRole("button", { name: "Изменить" }));
    const input = within(card).getByLabelText(/^Своя скидка, %/);
    expect(input).toHaveValue("25");
    await user.clear(input);
    await user.type(input, "120");
    await user.click(within(card).getByRole("button", { name: "Сохранить план" }));
    expect(await within(card).findByText(/целое число от 1 до 99/)).toBeInTheDocument();
    expect(promotionsApi.saveThursday).not.toHaveBeenCalled();
  });

  it("ошибка сервера — его текстом", async () => {
    const user = userEvent.setup();
    mockApi();
    vi.mocked(promotionsApi.saveThursday).mockRejectedValue(new ApiError(422, "Этот четверг уже прошёл", "domain_error", { field: "date" }));
    renderWithAdmin(<ThursdayCalendar />);
    const card = await screen.findByRole("region", { name: /8 октября/ });
    await user.click(within(card).getByRole("button", { name: "Изменить" }));
    await within(card).findByText("Да Хун Пао");
    await user.click(within(card).getByRole("button", { name: "Сохранить план" }));
    expect(await within(card).findByText("Этот четверг уже прошёл")).toBeInTheDocument();
  });

  it("снять план — только после подтверждения", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<ThursdayCalendar />);
    const card = await screen.findByRole("region", { name: /15 октября/ });
    await user.click(within(card).getByRole("button", { name: "Снять план" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/акции не будет/)).toBeInTheDocument();
    expect(promotionsApi.clearThursday).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Да, снять план" }));
    expect(promotionsApi.clearThursday).toHaveBeenCalledWith("2026-10-15");
  });

  it("режим «день» — скидка только в сам четверг", async () => {
    mockApi(calendar({ mode: "day" }));
    renderWithAdmin(<ThursdayCalendar />);
    const card = await screen.findByRole("region", { name: /8 октября/ });
    expect(within(card).getByText(/только 8 октября, с 00:00 до 23:59/)).toBeInTheDocument();
  });

  it("впереди ничего не запланировано — напоминаем", async () => {
    const cal = calendar();
    cal.upcoming = cal.upcoming.map((t) => thursday({ date: t.date, label: t.label }));
    mockApi(cal);
    renderWithAdmin(<ThursdayCalendar />);
    expect(await screen.findByText(/не запланировано ни одного четверга/)).toBeInTheDocument();
  });

  it("владельцу — ссылка на настройки чая недели, сотруднику — нет", async () => {
    mockApi();
    const { unmount } = renderWithAdmin(<ThursdayCalendar />);
    expect(await screen.findByRole("link", { name: /Настройки чая недели/ })).toHaveAttribute("href", "/admin/settings/thursday");
    unmount();
    renderWithAdmin(<ThursdayCalendar />, { owner: false, permissions: ["promotions"] });
    expect(await screen.findByRole("list", { name: "Ближайшие четверги" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Настройки чая недели/ })).not.toBeInTheDocument();
  });

  it("без права «Акции» экран закрыт", () => {
    mockApi();
    renderWithAdmin(<ThursdayCalendar />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(promotionsApi.thursdays).not.toHaveBeenCalled();
  });
});
