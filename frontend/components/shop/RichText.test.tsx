import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { productCard } from "@/tests/fixtures";

import { RichText } from "./RichText";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Как заваривать" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Лист " },
        { type: "text", text: "крупный", marks: [{ type: "bold" }] },
        { type: "text", text: ", вода " },
        { type: "text", text: "95°", marks: [{ type: "italic" }] },
        { type: "text", text: ". " },
        { type: "text", text: "Гайд", marks: [{ type: "link", attrs: { href: "https://example.org/x" } }] },
        { type: "text", text: " и " },
        { type: "text", text: "каталог", marks: [{ type: "link", attrs: { href: "/catalog" } }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "гайвань" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "чахай" }] }] },
      ],
    },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Не торопитесь." }] }] },
    { type: "image", attrs: { src: "/media/images/a/640.webp", alt: "Настой" } },
    { type: "horizontalRule" },
    { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
    { type: "iframe", attrs: { src: "https://evil" } },
    { type: "productCard", attrs: { slug: "da-hun-pao", name: "старое имя" } },
    { type: "productCard", attrs: { slug: "snyat", name: "Снятый с продажи" } },
  ],
};

describe("RichText — только разрешённые элементы редактора", () => {
  it("рисует заголовки, списки, цитаты, картинки и ссылки", () => {
    const { container } = render(<RichText doc={doc} products={{ "da-hun-pao": productCard() }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Как заваривать" })).toBeInTheDocument();
    expect(screen.getByText("крупный").tagName).toBe("STRONG");
    expect(screen.getByText("95°").tagName).toBe("EM");
    const external = screen.getByRole("link", { name: "Гайд" });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "каталог" })).not.toHaveAttribute("target");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Не торопитесь.").closest("blockquote")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Настой" })).toHaveAttribute("src", "/media/images/a/640.webp");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("текст не превращается в разметку, неизвестные элементы пропускаются", () => {
    const { container } = render(<RichText doc={doc} products={{}} />);
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("карточка товара — с актуальными данными; снятый товар не показывается", () => {
    render(<RichText doc={doc} products={{ "da-hun-pao": productCard() }} />);
    expect(screen.getByRole("link", { name: /Да Хун Пао/ })).toHaveAttribute("href", "/product/da-hun-pao");
    expect(screen.queryByText("старое имя")).not.toBeInTheDocument();
    expect(screen.queryByText("Снятый с продажи")).not.toBeInTheDocument();
  });

  it("пустой документ — ничего", () => {
    const { container } = render(<RichText doc={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
