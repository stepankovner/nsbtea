import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { productsApi } from "@/lib/admin/products";
import { renderWithAdmin } from "@/tests/admin";

import { cropToSquare } from "./crop";
import { adminProduct, productImage } from "./fixtures";
import { ProductPhotos } from "./ProductPhotos";

vi.mock("@/lib/admin/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/products")>();
  return {
    ...actual,
    productsApi: { uploadImages: vi.fn(), reorderImages: vi.fn(), updateImageAlt: vi.fn(), deleteImage: vi.fn() },
  };
});
// обрезка рисует на canvas — в тестовом браузере его нет, проверяем только, что она вызывается для каждого фото
vi.mock("./crop", () => ({ cropToSquare: vi.fn() }));
vi.mock("react-easy-crop", () => ({ default: () => <div data-testid="cropper" /> }));

const two = adminProduct({ images: [productImage(1), productImage(2, { alt: "Заварка в гайвани" })] });

function photo(name: string) {
  return new File([new Uint8Array(2000)], name, { type: "image/jpeg" });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(cropToSquare).mockImplementation(async (file: File) => new File([new Uint8Array(10)], `square-${file.name}`, { type: "image/jpeg" }));
});

describe("ProductPhotos — фото товара", () => {
  it("фото по порядку, первое — главное; подпись можно поменять", async () => {
    vi.mocked(productsApi.updateImageAlt).mockResolvedValue(two);
    renderWithAdmin(<ProductPhotos product={two} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Главное фото")).toBeInTheDocument();
    expect(within(items[1]!).getByRole("img", { name: "Заварка в гайвани" })).toBeInTheDocument();
    const caption = within(items[0]!).getByRole("textbox", { name: "Подпись к фото 1" });
    await userEvent.clear(caption);
    await userEvent.type(caption, "Сухой лист");
    await userEvent.tab();
    expect(productsApi.updateImageAlt).toHaveBeenCalledWith("p1", "i1", "Сухой лист");
  });

  it("порядок — кнопками «выше/ниже» (на телефоне и с клавиатуры)", async () => {
    vi.mocked(productsApi.reorderImages).mockResolvedValue(adminProduct({ images: [productImage(2), productImage(1)] }));
    renderWithAdmin(<ProductPhotos product={two} />);
    expect(screen.getByRole("button", { name: "Переместить фото 1 выше" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Переместить фото 2 ниже" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Переместить фото 2 выше" }));
    expect(productsApi.reorderImages).toHaveBeenCalledWith("p1", ["i2", "i1"]);
    // и перетаскивание — за ручку
    expect(screen.getAllByRole("button", { name: /Перетащить фото/ })).toHaveLength(2);
  });

  it("несколько фото сразу: каждое обрезаем до квадрата, потом загружаем одним разом", async () => {
    vi.mocked(productsApi.uploadImages).mockResolvedValue(two);
    renderWithAdmin(<ProductPhotos product={adminProduct()} />);
    const input = screen.getByLabelText("Выбрать фото");
    expect(input).toHaveAttribute("multiple");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(screen.getByLabelText("Снять на камеру")).toHaveAttribute("capture", "environment");

    await userEvent.upload(input, [photo("a.jpg"), photo("b.jpg")]);
    let dialog = await screen.findByRole("dialog", { name: /Фото 1 из 2/ });
    await userEvent.click(within(dialog).getByRole("button", { name: "Готово" }));
    dialog = await screen.findByRole("dialog", { name: /Фото 2 из 2/ });
    await userEvent.click(within(dialog).getByRole("button", { name: "Готово" }));

    await waitFor(() => expect(productsApi.uploadImages).toHaveBeenCalledTimes(1));
    const [id, files] = vi.mocked(productsApi.uploadImages).mock.calls[0]!;
    expect(id).toBe("p1");
    expect(files.map((f) => f.name)).toEqual(["square-a.jpg", "square-b.jpg"]);
    expect(cropToSquare).toHaveBeenCalledTimes(2);
  });

  it("обрезку остальных можно пропустить — обрежем по центру", async () => {
    vi.mocked(productsApi.uploadImages).mockResolvedValue(two);
    renderWithAdmin(<ProductPhotos product={adminProduct()} />);
    await userEvent.upload(screen.getByLabelText("Выбрать фото"), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);
    const dialog = await screen.findByRole("dialog", { name: /Фото 1 из 3/ });
    await userEvent.click(within(dialog).getByRole("button", { name: "Остальные — по центру" }));
    await waitFor(() => expect(productsApi.uploadImages).toHaveBeenCalledTimes(1));
    expect(vi.mocked(productsApi.uploadImages).mock.calls[0]![1]).toHaveLength(3);
  });

  it("удалить фото — с подтверждением", async () => {
    vi.mocked(productsApi.deleteImage).mockResolvedValue(adminProduct({ images: [productImage(1)] }));
    renderWithAdmin(<ProductPhotos product={two} />);
    await userEvent.click(screen.getByRole("button", { name: "Удалить фото 2" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Удалить фото" }));
    expect(productsApi.deleteImage).toHaveBeenCalledWith("p1", "i2");
  });

  it("не больше 10 фото", async () => {
    const nine = adminProduct({ images: Array.from({ length: 9 }, (_, i) => productImage(i + 1)) });
    renderWithAdmin(<ProductPhotos product={nine} />);
    await userEvent.upload(screen.getByLabelText("Выбрать фото"), [photo("a.jpg"), photo("b.jpg")]);
    expect(await screen.findByText(/Можно добавить ещё 1 фото/)).toBeInTheDocument();
    expect(productsApi.uploadImages).not.toHaveBeenCalled();
  });

  it("не картинка или слишком большой файл — понятная ошибка, без загрузки", async () => {
    renderWithAdmin(<ProductPhotos product={adminProduct()} />);
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Выбрать фото"), big);
    expect(await screen.findByText(/больше 15 МБ/)).toBeInTheDocument();
    expect(productsApi.uploadImages).not.toHaveBeenCalled();
  });
});
