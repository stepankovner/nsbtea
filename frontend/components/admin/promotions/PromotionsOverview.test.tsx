import { configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { promotionsApi } from "@/lib/admin/promotions";
import { renderWithAdmin } from "@/tests/admin";

import { calendar, loyalty, promoCode, promotion, teGuanYin, thursday } from "./fixtures";
import { PromotionsOverview } from "./PromotionsOverview";

vi.mock("@/lib/admin/promotions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/promotions")>();
  return {
    ...actual,
    promotionsApi: {
      list: vi.fn(),
      codes: vi.fn(),
      welcomeStats: vi.fn(),
      thursdays: vi.fn(),
      loyaltySettings: vi.fn(),
      listArchived: vi.fn(),
      codesArchived: vi.fn(),
      restore: vi.fn(),
      restoreCode: vi.fn(),
    },
  };
});

function mockAll({
  promotions = [promotion()],
  codes = [promoCode()],
  cal = calendar(),
}: { promotions?: ReturnType<typeof promotion>[]; codes?: ReturnType<typeof promoCode>[]; cal?: ReturnType<typeof calendar> } = {}) {
  vi.mocked(promotionsApi.list).mockResolvedValue(promotions);
  vi.mocked(promotionsApi.codes).mockResolvedValue(codes);
  vi.mocked(promotionsApi.welcomeStats).mockResolvedValue({ uses: 15, discount_kop: 450_000 });
  vi.mocked(promotionsApi.thursdays).mockResolvedValue(cal);
  vi.mocked(promotionsApi.loyaltySettings).mockResolvedValue(loyalty);
  vi.mocked(promotionsApi.listArchived).mockResolvedValue([]);
  vi.mocked(promotionsApi.codesArchived).mockResolvedValue([]);
}

const oldSale = promotion({ id: "old", title: "Летняя распродажа", archived: true, is_active: false, status_label: "Выключена" });
const oldCode = promoCode({ id: "pc-old", code: "LETO2026", archived: true, is_active: false });

// Формы с поиском товаров под нагрузкой (весь набор тестов идёт параллельно) отвечают дольше
// обычной секунды — даём запас, чтобы тесты не падали случайно.
configure({ asyncUtilTimeout: 3_000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PromotionsOverview — обзор акций", () => {
  it("акция: статус словом, скидка, период по Москве, на что действует, статистика", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />);
    const row = await screen.findByRole("link", { name: /Осенние улуны/ });
    expect(row).toHaveAttribute("href", "/admin/promotions/pr1");
    expect(within(row).getByText("Идёт")).toBeInTheDocument();
    expect(within(row).getByText("−15%")).toBeInTheDocument();
    expect(within(row).getByText(/2 октября 2026, 00:00 — 31 октября 2026, 23:59/)).toBeInTheDocument();
    expect(within(row).getByText(/Да Хун Пао/)).toBeInTheDocument();
    expect(within(row).getByText(/Улуны/)).toBeInTheDocument();
    expect(within(row).getByText(/12 раз, скидка 3\s400\s₽/)).toBeInTheDocument();
  });

  it("разные статусы акций различимы текстом", async () => {
    mockAll({
      promotions: [
        promotion({ id: "a", title: "Новогодняя", status_label: "Запланирована" }),
        promotion({ id: "b", title: "Летняя", status_label: "Закончилась" }),
        promotion({ id: "c", title: "Пауза", status_label: "Выключена", is_active: false }),
      ],
    });
    renderWithAdmin(<PromotionsOverview />);
    expect(within(await screen.findByRole("link", { name: /Новогодняя/ })).getByText("Запланирована")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Летняя/ })).getByText("Закончилась")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Пауза/ })).getByText("Выключена")).toBeInTheDocument();
  });

  it("промокод: код, скидка, условия, срок, использований; код можно скопировать", async () => {
    const user = userEvent.setup();
    mockAll();
    renderWithAdmin(<PromotionsOverview />);
    const row = await screen.findByRole("link", { name: /CHAI10/ });
    expect(row).toHaveAttribute("href", "/admin/promotions/codes/pc1");
    expect(within(row).getByText("Действует")).toBeInTheDocument();
    expect(within(row).getByText("−10%")).toBeInTheDocument();
    expect(within(row).getByText(/заказ от 2\s000\s₽/)).toBeInTheDocument();
    expect(within(row).getByText(/всего до 100 раз/)).toBeInTheDocument();
    expect(within(row).getByText(/1 раз на покупателя/)).toBeInTheDocument();
    expect(within(row).getByText(/Без срока/)).toBeInTheDocument();
    expect(within(row).getByText(/5 раз, скидка 1\s500\s₽/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Скопировать промокод CHAI10" }));
    expect(await navigator.clipboard.readText()).toBe("CHAI10");
  });

  it("ближайший чай недели и ссылка на календарь", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Чай недели" });
    expect(await within(section).findByText(/8 октября/)).toBeInTheDocument();
    expect(within(section).getByText(/Да Хун Пао/)).toBeInTheDocument();
    expect(within(section).getByText(/−20%/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: /Календарь четвергов/ })).toHaveAttribute("href", "/admin/promotions/thursdays");
  });

  it("ближайший четверг не запланирован — так и пишем", async () => {
    const cal = calendar();
    cal.upcoming[0] = thursday({ date: "2026-10-08", label: "8 октября" });
    mockAll({ cal });
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Чай недели" });
    expect(await within(section).findByText(/Не запланировано — в этот четверг акции не будет/)).toBeInTheDocument();
  });

  it("скидка на первый заказ: статистика; владельцу — текущие настройки и ссылки на них", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Скидка на первый заказ" });
    expect(await within(section).findByText(/15 раз, скидка 4\s500\s₽/)).toBeInTheDocument();
    expect(await within(section).findByText(/10%/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Настройки баллов/ })).toHaveAttribute("href", "/admin/settings/loyalty");
    expect(screen.getByRole("link", { name: /Настройки чая недели/ })).toHaveAttribute("href", "/admin/settings/thursday");
  });

  it("сотруднику ссылки на настройки не показываем и настройки не запрашиваем", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />, { owner: false, permissions: ["promotions"] });
    expect(await screen.findByRole("link", { name: /Осенние улуны/ })).toBeInTheDocument();
    expect(await screen.findByText(/15 раз, скидка 4\s500\s₽/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Настройки баллов/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Настройки чая недели/ })).not.toBeInTheDocument();
    expect(promotionsApi.loyaltySettings).not.toHaveBeenCalled();
  });

  it("главные действия: новая акция и новый промокод", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />);
    expect(screen.getByRole("link", { name: "Новая акция" })).toHaveAttribute("href", "/admin/promotions/new");
    expect(screen.getByRole("link", { name: "Новый промокод" })).toHaveAttribute("href", "/admin/promotions/codes/new");
  });

  it("пусто — подсказываем, что сделать", async () => {
    mockAll({ promotions: [], codes: [] });
    renderWithAdmin(<PromotionsOverview />);
    expect(await screen.findByText("Пока нет акций")).toBeInTheDocument();
    expect(await screen.findByText("Пока нет промокодов")).toBeInTheDocument();
  });

  it("архив акций: открывается отдельно, восстановленная акция возвращается выключенной", async () => {
    const user = userEvent.setup();
    mockAll();
    vi.mocked(promotionsApi.listArchived).mockResolvedValue([oldSale]);
    vi.mocked(promotionsApi.restore).mockResolvedValue({ ...oldSale, archived: false });
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Акции на товары" });
    expect(await within(section).findByRole("link", { name: /Осенние улуны/ })).toBeInTheDocument();
    // архив не грузим, пока его не открыли
    expect(promotionsApi.listArchived).not.toHaveBeenCalled();
    await user.click(within(section).getByRole("button", { name: "Архив" }));
    expect(within(section).getByRole("button", { name: "Архив" })).toHaveAttribute("aria-pressed", "true");
    expect(await within(section).findByText("Летняя распродажа")).toBeInTheDocument();
    expect(within(section).getByText("В архиве")).toBeInTheDocument();
    expect(within(section).getByText(/вернётся выключенной/)).toBeInTheDocument();
    expect(within(section).queryByRole("link", { name: /Осенние улуны/ })).not.toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Восстановить: Летняя распродажа" }));
    expect(promotionsApi.restore).toHaveBeenCalledWith("old");
    // списки обновились: действующие и архив
    await vi.waitFor(() => expect(promotionsApi.list).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(promotionsApi.listArchived).toHaveBeenCalledTimes(2));
  });

  it("архив пуст — так и пишем", async () => {
    const user = userEvent.setup();
    mockAll();
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Акции на товары" });
    await user.click(within(section).getByRole("button", { name: "Архив" }));
    expect(await within(section).findByText(/В архиве пусто/)).toBeInTheDocument();
  });

  it("архив промокодов: восстановить код", async () => {
    const user = userEvent.setup();
    mockAll();
    vi.mocked(promotionsApi.codesArchived).mockResolvedValue([oldCode]);
    vi.mocked(promotionsApi.restoreCode).mockResolvedValue({ ...oldCode, archived: false });
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Промокоды" });
    await user.click(within(section).getByRole("button", { name: "Архив" }));
    expect(await within(section).findByText("LETO2026")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Восстановить промокод LETO2026" }));
    expect(promotionsApi.restoreCode).toHaveBeenCalledWith("pc-old");
    await vi.waitFor(() => expect(promotionsApi.codes).toHaveBeenCalledTimes(2));
  });

  it("по ссылке из формы промокода сразу открывается архив промокодов", async () => {
    mockAll();
    vi.mocked(promotionsApi.codesArchived).mockResolvedValue([oldCode]);
    renderWithAdmin(<PromotionsOverview archive="codes" />);
    const section = await screen.findByRole("region", { name: "Промокоды" });
    expect(within(section).getByRole("button", { name: "Архив" })).toHaveAttribute("aria-pressed", "true");
    expect(await within(section).findByText("LETO2026")).toBeInTheDocument();
  });

  it("в режиме «неделя» показываем чай недели, который идёт с прошлого четверга", async () => {
    mockAll({
      cal: calendar({
        current: thursday({ date: "2026-10-01", label: "1 октября", planned: true, running: true, products: [teGuanYin], percent: 25, custom_percent: 25 }),
      }),
    });
    renderWithAdmin(<PromotionsOverview />);
    const section = await screen.findByRole("region", { name: "Чай недели" });
    expect(await within(section).findByText(/Сейчас идёт/)).toBeInTheDocument();
    expect(within(section).getByText(/Те Гуань Инь/)).toBeInTheDocument();
    expect(within(section).getByText(/−25%/)).toBeInTheDocument();
  });

  it("без права «Акции» экран закрыт", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(promotionsApi.list).not.toHaveBeenCalled();
  });
});
