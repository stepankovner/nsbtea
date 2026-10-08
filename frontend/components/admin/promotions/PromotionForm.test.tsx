import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lookupProducts } from "@/lib/admin/lookup";
import { promotionsApi } from "@/lib/admin/promotions";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { categoryTree, lookupTea, promotion } from "./fixtures";
import { PromotionForm } from "./PromotionForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));
vi.mock("@/lib/admin/promotions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/promotions")>();
  return {
    ...actual,
    promotionsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), categories: vi.fn() },
  };
});

function mockApi() {
  vi.mocked(lookupProducts).mockImplementation(async (params) => (params.ids ? [lookupTea].filter((p) => params.ids?.includes(p.id)) : [lookupTea]));
  vi.mocked(promotionsApi.categories).mockResolvedValue(categoryTree());
  vi.mocked(promotionsApi.list).mockResolvedValue([promotion()]);
  vi.mocked(promotionsApi.create).mockResolvedValue(promotion());
  vi.mocked(promotionsApi.update).mockResolvedValue(promotion());
  vi.mocked(promotionsApi.archive).mockResolvedValue({ ok: true });
}

async function addTea(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Добавить товар" }));
  await user.type(screen.getByPlaceholderText("Название товара"), "хун");
  await user.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PromotionForm — новая акция", () => {
  it("процент, товары, категория и даты по Москве уходят на сервер в нужном виде", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm />);
    await user.type(screen.getByLabelText(/^Название акции/), "Осенние улуны");
    await user.type(screen.getByLabelText(/^Скидка, %/), "15");
    await addTea(user);
    await user.click(await screen.findByRole("checkbox", { name: "Улуны" }));
    await user.type(screen.getByLabelText("Начало: дата"), "2026-10-10");
    await user.type(screen.getByLabelText("Окончание: дата"), "2026-10-20");
    await user.click(screen.getByRole("button", { name: "Создать акцию" }));
    expect(promotionsApi.create).toHaveBeenCalledWith({
      title: "Осенние улуны",
      percent: 15,
      amount_kop: null,
      // 10 октября 00:00 по Москве
      starts_at: "2026-10-09T21:00:00.000Z",
      // до конца 20 октября по Москве
      ends_at: "2026-10-20T21:00:00.000Z",
      is_active: true,
      product_ids: ["p1"],
      category_ids: ["cat1"],
    });
    expect(push).toHaveBeenCalledWith("/admin/promotions");
  });

  it("скидка в рублях — передаётся в копейках; без дат — бессрочно", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm />);
    await user.type(screen.getByLabelText(/^Название акции/), "Минус 150");
    await user.click(screen.getByRole("radio", { name: "В рублях" }));
    await user.type(screen.getByLabelText(/^Скидка, ₽/), "150");
    await user.tab();
    await addTea(user);
    await user.click(screen.getByRole("button", { name: "Создать акцию" }));
    expect(promotionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ percent: null, amount_kop: 15_000, starts_at: null, ends_at: null, product_ids: ["p1"], category_ids: [] }),
    );
  });

  it("у полей есть подсказки с примером", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm />);
    await user.click(screen.getByRole("button", { name: /Подсказка: Скидка, %/ }));
    expect(await screen.findByText(/Например, 15/)).toBeInTheDocument();
  });

  it("без товаров и категорий не сохраняем — объясняем почему", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm />);
    await user.type(screen.getByLabelText(/^Название акции/), "Пустая");
    await user.type(screen.getByLabelText(/^Скидка, %/), "10");
    await user.click(screen.getByRole("button", { name: "Создать акцию" }));
    expect(await screen.findByText(/Выберите товары или категории/)).toBeInTheDocument();
    expect(promotionsApi.create).not.toHaveBeenCalled();
  });

  it("процент — целое число от 1 до 99", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm />);
    await user.type(screen.getByLabelText(/^Название акции/), "Слишком много");
    await user.type(screen.getByLabelText(/^Скидка, %/), "150");
    await addTea(user);
    await user.click(screen.getByRole("button", { name: "Создать акцию" }));
    expect(await screen.findByText(/целое число от 1 до 99/)).toBeInTheDocument();
    expect(promotionsApi.create).not.toHaveBeenCalled();
  });

  it("ошибка сервера показывается его текстом", async () => {
    const user = userEvent.setup();
    mockApi();
    vi.mocked(promotionsApi.create).mockRejectedValue(
      new ApiError(422, "Дата окончания должна быть позже даты начала", "domain_error", { field: "ends_at" }),
    );
    renderWithAdmin(<PromotionForm />);
    await user.type(screen.getByLabelText(/^Название акции/), "Осенние улуны");
    await user.type(screen.getByLabelText(/^Скидка, %/), "15");
    await addTea(user);
    await user.click(screen.getByRole("button", { name: "Создать акцию" }));
    expect(await screen.findByText("Дата окончания должна быть позже даты начала")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("PromotionForm — изменение акции", () => {
  it("поля заполнены по московскому времени, изменения сохраняются", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm id="pr1" />);
    const title = await screen.findByLabelText(/^Название акции/);
    expect(title).toHaveValue("Осенние улуны");
    expect(screen.getByLabelText(/^Скидка, %/)).toHaveValue("15");
    expect(screen.getByLabelText("Начало: дата")).toHaveValue("2026-10-02");
    expect(screen.getByLabelText("Начало: время")).toHaveValue("00:00");
    expect(screen.getByLabelText("Окончание: дата")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Окончание: время")).toHaveValue("23:59");
    expect(screen.getByText(/12 раз, скидка 3\s400\s₽/)).toBeInTheDocument();
    await user.clear(title);
    await user.type(title, "Осенние улуны и красный");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(promotionsApi.update).toHaveBeenCalledWith("pr1", {
      title: "Осенние улуны и красный",
      percent: 15,
      amount_kop: null,
      starts_at: "2026-10-01T21:00:00.000Z",
      ends_at: "2026-10-31T21:00:00.000Z",
      is_active: true,
      product_ids: ["p1"],
      category_ids: ["cat1"],
    });
  });

  it("акцию можно поставить на паузу переключателем", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm id="pr1" />);
    await user.click(await screen.findByRole("switch", { name: /Акция включена/ }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(promotionsApi.update).toHaveBeenCalledWith("pr1", expect.objectContaining({ is_active: false }));
  });

  it("в архив — только после подтверждения с объяснением", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithAdmin(<PromotionForm id="pr1" />);
    await user.click(await screen.findByRole("button", { name: "Убрать в архив" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/перестанет действовать/)).toBeInTheDocument();
    expect(promotionsApi.archive).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Да, убрать в архив" }));
    expect(promotionsApi.archive).toHaveBeenCalledWith("pr1");
    expect(push).toHaveBeenCalledWith("/admin/promotions");
  });

  it("сотрудник без доступа к товарам: список категорий не загружаем, выбранные видны", async () => {
    mockApi();
    renderWithAdmin(<PromotionForm id="pr1" />, { owner: false, permissions: ["promotions"] });
    expect(await screen.findByLabelText(/^Название акции/)).toHaveValue("Осенние улуны");
    expect(screen.getByText("Улуны")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Убрать категорию: Улуны" })).toBeInTheDocument();
    expect(promotionsApi.categories).not.toHaveBeenCalled();
  });

  it("акции нет (например, уже в архиве) — понятное сообщение", async () => {
    mockApi();
    vi.mocked(promotionsApi.list).mockResolvedValue([]);
    renderWithAdmin(<PromotionForm id="pr404" />);
    expect(await screen.findByText(/Акция не найдена/)).toBeInTheDocument();
  });
});
