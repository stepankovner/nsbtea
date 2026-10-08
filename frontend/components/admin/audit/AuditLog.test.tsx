import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { auditApi } from "@/lib/admin/audit";
import { settingsApi } from "@/lib/admin/settings";
import { staffApi } from "@/lib/admin/staff";
import { renderWithAdmin } from "@/tests/admin";

import { settingsMeta } from "../settings/fixtures";
import { staff, staffList } from "../staff/fixtures";
import { AuditPage } from "./AuditLog";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/audit",
}));
vi.mock("@/lib/admin/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/audit")>();
  return { ...actual, auditApi: { list: vi.fn() } };
});
vi.mock("@/lib/admin/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/staff")>();
  return { ...actual, staffApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), revoke: vi.fn(), renewInvite: vi.fn() } };
});
vi.mock("@/lib/admin/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/settings")>();
  return { ...actual, settingsApi: { all: vi.fn(), meta: vi.fn(), save: vi.fn() } };
});

type Entry = Schemas["AuditEntry"];

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    at: "2026-10-05T09:00:00Z",
    actor_name: "Никита",
    action: "product.update",
    entity: "product",
    entity_id: "p1",
    summary: "Изменён товар «Да Хун Пао»",
    diff: { price_per_gram_kop: [1200, 1400], status: ["hidden", "published"] },
    ...overrides,
  };
}

function setup(items: Entry[], total = items.length) {
  vi.mocked(auditApi.list).mockResolvedValue({ items, total });
  vi.mocked(staffApi.list).mockResolvedValue(staffList([staff()]));
  vi.mocked(settingsApi.meta).mockResolvedValue(settingsMeta());
}

/** Строки «было → стало» записи журнала — как их прочитает человек. */
function rows(article: HTMLElement): string[] {
  return within(article)
    .queryAllByRole("listitem")
    .map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim());
}

describe("Журнал действий", () => {
  it("кто, когда (по Москве) и что сделал; было → стало понятными словами и ссылка на товар", async () => {
    search = new URLSearchParams();
    setup([entry()]);
    renderWithAdmin(<AuditPage />);

    const item = await screen.findByRole("article", { name: "Изменён товар «Да Хун Пао»" });
    expect(screen.getByRole("heading", { name: "5 октября 2026" })).toBeInTheDocument();
    expect(within(item).getByText("12:00")).toBeInTheDocument();
    expect(within(item).getByText("Никита")).toBeInTheDocument();
    expect(rows(item)).toEqual(expect.arrayContaining(["Цена за 1 г: 12 ₽ → 14 ₽", "Статус: Скрыт → На сайте"]));
    expect(within(item).getByRole("link", { name: /Открыть товар/ })).toHaveAttribute("href", "/admin/products/p1");
  });

  it("заказы и доступы: статусы и разделы названиями, даты — по Москве", async () => {
    search = new URLSearchParams();
    setup([
      entry({
        id: "e2",
        action: "order.status",
        entity: "order",
        entity_id: "o1",
        summary: "Заказ NSB-10001: Оплачен (новый) → Собирается",
        diff: { status: ["paid", "assembling"] },
      }),
      entry({
        id: "e3",
        action: "staff.invite",
        entity: "admin_user",
        entity_id: "s1",
        summary: "Приглашён сотрудник Аня (anya@example.com)",
        diff: { permissions: [null, ["orders", "inventory"]], expires_at: [null, "2099-12-31 20:59:59+00:00"] },
      }),
    ]);
    renderWithAdmin(<AuditPage />);

    const order = await screen.findByRole("article", { name: /Заказ NSB-10001/ });
    expect(rows(order)).toContain("Статус: Оплачен (новый) → Собирается");
    expect(within(order).getByRole("link", { name: /Открыть заказ/ })).toHaveAttribute("href", "/admin/orders/o1");

    const invite = screen.getByRole("article", { name: /Приглашён сотрудник Аня/ });
    expect(rows(invite)).toEqual(expect.arrayContaining(["Разделы: — → Заказы, Склад", "Доступ до: — → 31 декабря 2099, 23:59"]));
    expect(within(invite).getByRole("link", { name: /К сотрудникам/ })).toHaveAttribute("href", "/admin/staff");
  });

  it("настройки: подписи как в настройках, деньги в рублях, налог — названием", async () => {
    search = new URLSearchParams();
    setup([
      entry({
        id: "e4",
        action: "settings.update",
        entity: "settings",
        entity_id: "delivery",
        summary: "Изменены настройки «Доставка»",
        diff: { courier_price_kop: [0, 15_000], cdek_enabled: [true, false] },
      }),
      entry({
        id: "e5",
        action: "settings.update",
        entity: "settings",
        entity_id: "payment",
        summary: "Изменены настройки «Оплата и чеки»",
        diff: { tax_system: ["usn_income", "osn"] },
      }),
    ]);
    renderWithAdmin(<AuditPage />);

    const delivery = await screen.findByRole("article", { name: "Изменены настройки «Доставка»" });
    expect(await within(delivery).findByText(/Стоимость курьера/)).toBeInTheDocument();
    expect(rows(delivery)).toEqual(expect.arrayContaining(["Стоимость курьера: 0 ₽ → 150 ₽", "СДЭК включён: да → нет"]));
    expect(within(delivery).getByRole("link", { name: /Открыть настройки/ })).toHaveAttribute("href", "/admin/settings/delivery");
    const payment = screen.getByRole("article", { name: "Изменены настройки «Оплата и чеки»" });
    expect(rows(payment)).toContain("Система налогообложения: УСН «Доходы» → ОСН — общая");
  });

  it("склад — остатки по товарам; сложные значения — «изменено», без технических данных", async () => {
    search = new URLSearchParams();
    setup([
      entry({
        id: "e6",
        action: "inventory.supply",
        entity: "supply",
        entity_id: "sup1",
        summary: "Принята поставка: 1 поз.",
        diff: { "Да Хун Пао": [100, 150] },
      }),
      entry({
        id: "e7",
        summary: "Изменён товар «Бай Му Дань»",
        diff: { attributes: [{ region: "Уишань" }, { region: "Фуцзянь" }], description_changed: ["…", "…"], category_id: ["0192a", "0192b"] },
      }),
    ]);
    renderWithAdmin(<AuditPage />);

    const supply = await screen.findByRole("article", { name: "Принята поставка: 1 поз." });
    expect(rows(supply)).toContain("Остаток «Да Хун Пао»: 100 → 150");

    const product = screen.getByRole("article", { name: "Изменён товар «Бай Му Дань»" });
    expect(rows(product)).toEqual(expect.arrayContaining(["Характеристики: изменено", "Описание: изменено", "Категория: изменено"]));
    expect(product.textContent).not.toMatch(/[{}[\]]|0192a/);
  });

  it("фильтр по сотруднику и разделу — в адресе страницы и в запросе", async () => {
    search = new URLSearchParams();
    setup([entry()]);
    renderWithAdmin(<AuditPage />);
    const who = await screen.findByLabelText("Кто");
    await screen.findByRole("option", { name: "Аня" });
    await userEvent.selectOptions(who, "Аня");
    expect(replace).toHaveBeenCalledWith("/admin/audit?actor=s1");
    await userEvent.selectOptions(screen.getByLabelText("Что менялось"), "Заказы");
    expect(replace).toHaveBeenCalledWith("/admin/audit?entity=order");
  });

  it("фильтр из адреса уходит в запрос", async () => {
    search = new URLSearchParams("actor=s1&entity=order");
    setup([]);
    renderWithAdmin(<AuditPage />);
    expect(await screen.findByText(/Ничего не нашлось/)).toBeInTheDocument();
    expect(auditApi.list).toHaveBeenCalledWith(expect.objectContaining({ actor_id: "s1", entity: "order", page: 1 }));
    expect(screen.getByRole("link", { name: "Сбросить фильтры" })).toHaveAttribute("href", "/admin/audit");
  });

  it("«Показать ещё» догружает следующие записи", async () => {
    search = new URLSearchParams();
    setup([entry(), entry({ id: "e2", summary: "Изменён товар «Шу пуэр»" })], 3);
    renderWithAdmin(<AuditPage />);
    await screen.findByRole("article", { name: "Изменён товар «Шу пуэр»" });

    vi.mocked(auditApi.list).mockResolvedValue({ items: [entry({ id: "e3", summary: "Изменён товар «Те Гуань Инь»" })], total: 3 });
    await userEvent.click(screen.getByRole("button", { name: /Показать ещё/ }));
    expect(await screen.findByRole("article", { name: "Изменён товар «Те Гуань Инь»" })).toBeInTheDocument();
    expect(auditApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.getByRole("article", { name: "Изменён товар «Да Хун Пао»" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Показать ещё/ })).not.toBeInTheDocument();
  });

  it("пусто — объясняем, что здесь появится", async () => {
    search = new URLSearchParams();
    setup([]);
    renderWithAdmin(<AuditPage />);
    expect(await screen.findByText("Пока пусто")).toBeInTheDocument();
  });

  it("сотруднику раздел недоступен", async () => {
    search = new URLSearchParams();
    renderWithAdmin(<AuditPage />, { owner: false, permissions: ["orders"] });
    expect(await screen.findByText("Этот раздел доступен только владельцу")).toBeInTheDocument();
    expect(auditApi.list).not.toHaveBeenCalled();
  });
});
