import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { categoriesApi } from "@/lib/admin/categories";
import { lookupProducts } from "@/lib/admin/lookup";
import { productsApi } from "@/lib/admin/products";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { adminProduct, categoriesTree, draftTea } from "./fixtures";
import { ProductEditor } from "./ProductEditor";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/products/p1",
}));
vi.mock("@/lib/admin/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/products")>();
  return {
    ...actual,
    productsApi: {
      get: vi.fn(),
      patch: vi.fn(),
      publish: vi.fn(),
      hide: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
      copy: vi.fn(),
      setRelations: vi.fn(),
      tags: vi.fn(),
      weightPresets: vi.fn(),
      uploadImages: vi.fn(),
      reorderImages: vi.fn(),
      updateImageAlt: vi.fn(),
      deleteImage: vi.fn(),
    },
  };
});
vi.mock("@/lib/admin/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/categories")>();
  return { ...actual, categoriesApi: { list: vi.fn() } };
});
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));

beforeEach(() => {
  push.mockReset();
  vi.mocked(categoriesApi.list).mockResolvedValue(categoriesTree);
  vi.mocked(productsApi.tags).mockResolvedValue([]);
  vi.mocked(productsApi.weightPresets).mockResolvedValue([25, 50, 100, 200]);
  vi.mocked(lookupProducts).mockResolvedValue([]);
});

describe("ProductEditor — карточка товара", () => {
  it("статус, «Открыть на сайте»; остаток только показывается — менять его на складе", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    renderWithAdmin(<ProductEditor id="p1" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Да Хун Пао/ })).toBeInTheDocument();
    expect(screen.getAllByText("На сайте").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Открыть на сайте/ })).toHaveAttribute("href", "/product/da-hun-pao");
    const stock = screen.getByRole("region", { name: "Остаток" });
    expect(within(stock).getByText("600 г")).toBeInTheDocument();
    expect(within(stock).getByRole("link", { name: "Изменить остаток на складе" })).toHaveAttribute(
      "href",
      "/admin/inventory?product=p1",
    );
    expect(within(stock).queryByRole("textbox", { name: /Остаток/ })).not.toBeInTheDocument();
  });

  it("изменения сохраняются кнопкой — уходят только изменённые поля", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    vi.mocked(productsApi.patch).mockResolvedValue(adminProduct({ short_description: "Новый текст" }));
    renderWithAdmin(<ProductEditor id="p1" />);
    const short = await screen.findByRole("textbox", { name: "Коротко о товаре" });
    await userEvent.clear(short);
    await userEvent.type(short, "Новый текст");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", { short_description: "Новый текст" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Сохранить изменения" })).not.toBeInTheDocument());
  });

  it("порог «Осталось мало» — с подсказкой и значением по умолчанию", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    vi.mocked(productsApi.patch).mockResolvedValue(adminProduct({ low_stock_threshold: 100, effective_threshold: 100 }));
    renderWithAdmin(<ProductEditor id="p1" />);
    const field = await screen.findByRole("textbox", { name: "Порог «Осталось мало», г" });
    expect(field).toHaveAttribute("placeholder", "50");
    expect(screen.getByRole("button", { name: "Подсказка: Порог «Осталось мало», г" })).toBeInTheDocument();
    await userEvent.type(field, "100");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", { low_stock_threshold: 100 });
  });

  it("скрыть с сайта и снова показать", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    vi.mocked(productsApi.hide).mockResolvedValue(adminProduct({ status: "hidden", status_label: "Скрыт" }));
    vi.mocked(productsApi.publish).mockResolvedValue(adminProduct());
    renderWithAdmin(<ProductEditor id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Скрыть с сайта" }));
    expect(productsApi.hide).toHaveBeenCalledWith("p1");
    await userEvent.click(await screen.findByRole("button", { name: "Показать на сайте" }));
    expect(productsApi.publish).toHaveBeenCalledWith("p1");
  });

  it("показать на сайте: сервер отказал — объясняем, что и где заполнить", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(
      adminProduct({ status: "hidden", status_label: "Скрыт", price_per_gram_kop: null, publish_problems: ["цену"] }),
    );
    vi.mocked(productsApi.publish).mockRejectedValue(
      new ApiError(400, "Чтобы показать товар на сайте, заполните: цену", "domain_error"),
    );
    renderWithAdmin(<ProductEditor id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Показать на сайте" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Чтобы показать товар на сайте, заполните: цену");
    expect(within(alert).getByRole("link", { name: /Цена и граммовки/ })).toHaveAttribute("href", "#product-price");
  });

  it("создать копию — объясняем, что фото и остаток не копируются", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    vi.mocked(productsApi.copy).mockResolvedValue(draftTea({ id: "p2", name: "Да Хун Пао (копия)" }));
    renderWithAdmin(<ProductEditor id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Создать копию" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Фото и остаток не копируются/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать копию" }));
    expect(productsApi.copy).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/products/p2"));
  });

  it("убрать в архив (с объяснением) и восстановить", async () => {
    vi.mocked(productsApi.get)
      .mockResolvedValueOnce(adminProduct())
      .mockResolvedValue(adminProduct({ status: "hidden", status_label: "В архиве", archived_at: "2026-10-08T10:00:00Z" }));
    vi.mocked(productsApi.archive).mockResolvedValue({ ok: true } as never);
    vi.mocked(productsApi.restore).mockResolvedValue(adminProduct({ status: "hidden", status_label: "Скрыт" }));
    renderWithAdmin(<ProductEditor id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Убрать в архив" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Восстановить/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Убрать в архив" }));
    expect(productsApi.archive).toHaveBeenCalledWith("p1");
    await userEvent.click(await screen.findByRole("button", { name: "Восстановить" }));
    expect(productsApi.restore).toHaveBeenCalledWith("p1");
  });

  it("сервер не принял поле — ошибка рядом с полем", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    vi.mocked(productsApi.patch).mockRejectedValue(
      new ApiError(409, "Адрес «puer» уже занят — придумайте другой", "conflict", { field: "slug" }),
    );
    renderWithAdmin(<ProductEditor id="p1" />);
    const slug = await screen.findByRole("textbox", { name: "Адрес страницы" });
    await userEvent.clear(slug);
    await userEvent.type(slug, "puer");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", { slug: "puer" });
    expect((await screen.findAllByText("Адрес «puer» уже занят — придумайте другой")).length).toBeGreaterThan(0);
  });

  it("черновик в карточке сохраняется сам и его можно продолжить по шагам", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    vi.mocked(productsApi.patch).mockResolvedValue(draftTea({ short_description: "Тёмный улун" }));
    renderWithAdmin(<ProductEditor id="p1" autosaveDelay={20} />);
    expect(await screen.findByRole("link", { name: /Продолжить по шагам/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/admin\/products\/p1\/edit\?step=\d$/),
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Коротко о товаре" }), "Тёмный улун");
    await waitFor(() => expect(productsApi.patch).toHaveBeenLastCalledWith("p1", { short_description: "Тёмный улун" }));
    expect(await screen.findByText("Черновик сохранён")).toBeInTheDocument();
  });

  it("предпросмотр — по нажатию", async () => {
    vi.mocked(productsApi.get).mockResolvedValue(adminProduct());
    renderWithAdmin(<ProductEditor id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Предпросмотр" }));
    expect(await screen.findByRole("region", { name: "Как это увидит покупатель" })).toBeInTheDocument();
  });
});
