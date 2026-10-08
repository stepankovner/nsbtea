import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { settingsApi } from "@/lib/admin/settings";
import { renderWithAdmin } from "@/tests/admin";

import { allSettings, settingsMeta } from "./fixtures";
import { SettingsGroupPage } from "./SettingsGroupForm";

vi.mock("@/lib/admin/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/settings")>();
  return { ...actual, settingsApi: { all: vi.fn(), meta: vi.fn(), save: vi.fn() } };
});

function load(overrides: Parameters<typeof allSettings>[0] = {}) {
  const values = allSettings(overrides);
  vi.mocked(settingsApi.all).mockResolvedValue(values);
  vi.mocked(settingsApi.meta).mockResolvedValue(settingsMeta());
  return values;
}

/** Уход со страницы: браузер переспрашивает, если обработчик отменил событие. */
function leavePage(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("Настройки — форма раздела", () => {
  it("деньги вводятся в рублях, а сохраняются в копейках; подписи и пояснения — с сервера", async () => {
    const values = load({ delivery: { courier_price_kop: 15_000 } });
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="delivery" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Доставка" })).toBeInTheDocument();
    // в подписи нет «коп.» — сумма вводится в рублях
    const courier = screen.getByLabelText("Стоимость курьера");
    expect(courier).toHaveValue("150");
    expect(screen.queryByLabelText(/коп\./)).not.toBeInTheDocument();
    expect(screen.getByText("0 — бесплатно.")).toBeInTheDocument();

    await userEvent.clear(courier);
    await userEvent.type(courier, "200");
    await userEvent.type(screen.getByLabelText("Бесплатная доставка СДЭК от"), "3000");
    await userEvent.tab();
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(settingsApi.save).toHaveBeenCalledWith("delivery", {
      ...values.delivery,
      courier_price_kop: 20_000,
      cdek_free_from_kop: 300_000,
    });
  });

  it("проценты и дни — целыми числами; пустое поле означает «нет» (баллы не сгорают)", async () => {
    const values = load();
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="loyalty" />);

    const earn = await screen.findByLabelText("Начислять баллов, % от суммы");
    expect(earn).toHaveValue("5");
    expect(screen.getByText(/1 балл = 1 ₽/)).toBeInTheDocument();
    const ttl = screen.getByLabelText("Срок жизни баллов, дней");
    expect(ttl).toHaveValue("");
    expect(screen.getByText("Пусто — баллы не сгорают.")).toBeInTheDocument();

    await userEvent.clear(earn);
    await userEvent.type(earn, "7");
    await userEvent.type(ttl, "365");
    await userEvent.click(screen.getByRole("switch", { name: "Приветственная скидка включена" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(settingsApi.save).toHaveBeenCalledWith("loyalty", {
      ...values.loyalty,
      earn_percent: 7,
      points_ttl_days: 365,
      welcome_enabled: false,
    });
  });

  it("не число — подсказываем у поля и ничего не отправляем", async () => {
    load();
    renderWithAdmin(<SettingsGroupPage group="loyalty" />);
    const earn = await screen.findByLabelText("Начислять баллов, % от суммы");
    await userEvent.clear(earn);
    await userEvent.type(earn, "пять");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/Введите целое число/)).toBeInTheDocument();
    expect(earn).toHaveAttribute("aria-invalid", "true");
    expect(settingsApi.save).not.toHaveBeenCalled();
  });

  it("налоговая система и ставка НДС — выбором из списка, названия как у бухгалтера", async () => {
    const values = load();
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="payment" />);

    expect(await screen.findByRole("radio", { name: "УСН «Доходы»" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Без НДС" })).toBeChecked();
    expect(screen.getByText("Уточните у бухгалтера — попадает в каждый чек.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "ОСН — общая" }));
    await userEvent.click(screen.getByRole("radio", { name: "НДС 22%" }));
    await userEvent.click(screen.getByRole("switch", { name: "Разрешить оплату при получении" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(settingsApi.save).toHaveBeenCalledWith("payment", {
      ...values.payment,
      tax_system: "osn",
      vat_type: "vat22",
      allow_pay_on_delivery: true,
    });
  });

  it("чай недели: скидка в процентах и срок — «Неделю» или «День»", async () => {
    load();
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="thursday" />);

    expect(await screen.findByLabelText("Скидка, %")).toHaveValue("20");
    expect(screen.getByRole("radio", { name: /Неделю/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /День/ }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(settingsApi.save).toHaveBeenCalledWith("thursday", { percent: 20, mode: "day" });
  });

  it("варианты веса — список: можно убрать и добавить, порядок — по возрастанию", async () => {
    const values = load();
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="catalog" />);

    await userEvent.click(await screen.findByRole("button", { name: "Убрать 200 г" }));
    await userEvent.type(screen.getByLabelText("Новый вариант веса, г"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(screen.getByRole("button", { name: "Убрать 150 г" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(settingsApi.save).toHaveBeenCalledWith("catalog", { ...values.catalog, weight_presets: [25, 50, 100, 150] });
  });

  it("коробки — понятными полями, без технических кодов", async () => {
    const values = load();
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="delivery" />);

    const first = await screen.findByRole("group", { name: "Коробка 1" });
    expect(within(first).getByLabelText("Название")).toHaveValue("Маленькая");
    expect(within(first).getByLabelText("Вес до, г")).toHaveValue("1000");
    expect(screen.queryByDisplayValue("s")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Добавить коробку" }));
    const added = screen.getByRole("group", { name: "Коробка 4" });
    await userEvent.type(within(added).getByLabelText("Название"), "Подарочная");
    await userEvent.type(within(added).getByLabelText("Вес до, г"), "500");
    await userEvent.type(within(added).getByLabelText("Длина, см"), "25");
    await userEvent.type(within(added).getByLabelText("Ширина, см"), "20");
    await userEvent.type(within(added).getByLabelText("Высота, см"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    const [, body] = vi.mocked(settingsApi.save).mock.calls[0]!;
    const boxes = (body as typeof values.delivery).boxes!;
    expect(boxes).toHaveLength(4);
    expect(boxes.slice(0, 3)).toEqual(values.delivery.boxes);
    expect(boxes[3]).toEqual({
      code: expect.any(String),
      name: "Подарочная",
      max_weight_grams: 500,
      length_cm: 25,
      width_cm: 20,
      height_cm: 8,
    });
    // код новой коробки не совпадает с существующими
    expect(values.delivery.boxes!.map((b) => b.code)).not.toContain(boxes[3]!.code);
  });

  it("ошибки сервера показываются у тех полей, к которым относятся", async () => {
    load();
    vi.mocked(settingsApi.save).mockRejectedValue(
      new ApiError(422, "Проверьте заполнение полей", "validation_error", {
        errors: [{ field: "earn_percent", message: "Должно быть не больше 100" }],
      }),
    );
    renderWithAdmin(<SettingsGroupPage group="loyalty" />);
    const earn = await screen.findByLabelText("Начислять баллов, % от суммы");
    await userEvent.clear(earn);
    await userEvent.type(earn, "150");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Должно быть не больше 100")).toBeInTheDocument();
    expect(earn).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Проверьте заполнение полей");
  });

  it("несохранённые изменения: браузер переспросит при уходе со страницы", async () => {
    load();
    vi.mocked(settingsApi.save).mockImplementation(async (_group, body) => body);
    renderWithAdmin(<SettingsGroupPage group="store" />);

    const phone = await screen.findByLabelText("Телефон магазина");
    expect(leavePage()).toBe(false);
    await userEvent.type(phone, "+7 900 123-45-67");
    expect(screen.getByText(/Есть несохранённые изменения/)).toBeInTheDocument();
    expect(leavePage()).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(settingsApi.save).toHaveBeenCalledWith("store", expect.objectContaining({ phone: "+7 900 123-45-67" }));
    expect(await screen.findByText(/Все изменения сохранены/)).toBeInTheDocument();
    expect(leavePage()).toBe(false);
  });

  it("у неочевидных полей без пояснения — подсказка «?» с примером", async () => {
    load();
    renderWithAdmin(<SettingsGroupPage group="store" />);
    await userEvent.click(await screen.findByRole("button", { name: "Подсказка: ИНН" }));
    expect(await screen.findByText(/Например/)).toBeInTheDocument();
  });

  it("длинная форма разбита на понятные части", async () => {
    load();
    renderWithAdmin(<SettingsGroupPage group="store" />);
    expect(await screen.findByRole("heading", { name: "Реквизиты ИП" })).toBeInTheDocument();
    expect(screen.getByLabelText("Название ИП")).toBeInTheDocument();
    expect(screen.getByText("Как в документах, например: ИП Булич Никита Сергеевич.")).toBeInTheDocument();
  });

  it("неизвестный раздел — понятное сообщение и ссылка на все настройки", async () => {
    load();
    renderWithAdmin(<SettingsGroupPage group="nope" />);
    expect(await screen.findByText("Такого раздела настроек нет")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Все настройки/ })[0]).toHaveAttribute("href", "/admin/settings");
  });

  it("сотруднику — «доступно только владельцу», настройки не загружаются", async () => {
    renderWithAdmin(<SettingsGroupPage group="loyalty" />, { owner: false, permissions: ["orders"] });
    expect(await screen.findByText("Этот раздел доступен только владельцу")).toBeInTheDocument();
    expect(settingsApi.all).not.toHaveBeenCalled();
  });
});
