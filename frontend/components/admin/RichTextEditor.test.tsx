import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithAdmin } from "@/tests/admin";

import { RichTextEditor } from "./RichTextEditor";

vi.mock("@/lib/admin/media", () => ({ uploadMedia: vi.fn(), MAX_UPLOAD_MB: 15 }));
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn().mockResolvedValue([]) }));

describe("RichTextEditor — визуальный редактор", () => {
  it("показывает текст и понятную панель кнопок", async () => {
    renderWithAdmin(
      <RichTextEditor
        label="Текст страницы"
        value={{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Привет, чай" }] }] }}
        onChange={vi.fn()}
      />,
    );
    expect(await screen.findByText("Привет, чай")).toBeInTheDocument();
    for (const name of ["Заголовок", "Подзаголовок", "Жирный", "Курсив", "Список", "Нумерованный список", "Цитата", "Ссылка", "Картинка", "Карточка товара", "Отменить"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
