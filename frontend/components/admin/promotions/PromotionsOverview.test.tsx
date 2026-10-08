import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { promotionsApi } from "@/lib/admin/promotions";
import { renderWithAdmin } from "@/tests/admin";

import { calendar, loyalty, promoCode, promotion, thursday } from "./fixtures";
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
}

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

  it("без права «Акции» экран закрыт", async () => {
    mockAll();
    renderWithAdmin(<PromotionsOverview />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(promotionsApi.list).not.toHaveBeenCalled();
  });
});
