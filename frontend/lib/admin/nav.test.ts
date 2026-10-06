import { describe, expect, it } from "vitest";

import { bottomNav, moreNav, sideNav, type NavUser } from "./nav";

const owner: NavUser = { is_owner: true, permissions: [] };
const helper: NavUser = { is_owner: false, permissions: ["orders", "inventory"] };

describe("навигация админки по правам", () => {
  it("владелец видит всё; на телефоне — Заказы, Товары, Склад, Акции, Ещё", () => {
    expect(bottomNav(owner).map((i) => i.label)).toEqual(["Заказы", "Товары", "Склад", "Акции", "Ещё"]);
    const side = sideNav(owner).map((i) => i.label);
    expect(side).toContain("Настройки");
    expect(side).toContain("Сотрудники");
    expect(side[0]).toBe("Сводка");
  });

  it("помощник видит только свои разделы, без настроек и доступов", () => {
    expect(bottomNav(helper).map((i) => i.label)).toEqual(["Заказы", "Склад", "Ещё"]);
    const side = sideNav(helper).map((i) => i.label);
    expect(side).toEqual(["Сводка", "Заказы", "Склад"]);
    expect(moreNav(helper).map((i) => i.label)).toEqual(["Сводка", "Мой профиль"]);
  });

  it("в «Ещё» на телефоне — то, чего нет в нижней панели", () => {
    const labels = moreNav(owner).map((i) => i.label);
    expect(labels).toContain("Клиенты");
    expect(labels).toContain("Заявки");
    expect(labels).toContain("Сайт: страницы и события");
    expect(labels).not.toContain("Заказы");
  });
});
