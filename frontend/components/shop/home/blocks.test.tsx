import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";

import { AdvantagesBlock, EventsBlock, ProductsBlock, ServicesBlock, ThursdayBlock } from "./blocks";

vi.mock("@/components/shop/ApplicationForm", () => ({ ApplicationForm: () => null }));
vi.mock("@/components/shop/AddToCartButton", () => ({ AddToCartButton: () => null }));

const blocks = [
  ["thursday", ThursdayBlock],
  ["featured", ProductsBlock],
  ["new_products", ProductsBlock],
  ["sets", ProductsBlock],
  ["events", EventsBlock],
  ["services", ServicesBlock],
  ["advantages", AdvantagesBlock],
] as const;

describe("Пустые блоки при заполнении сайта", () => {
  for (const [kind, Component] of blocks) {
    it(kind + ": выключен по умолчанию, включается явным выбором владельца", () => {
      const block: Schemas["HomeBlockOut"] = {
        kind, data: { title: "Заголовок владельца", note: "Пояснение владельца" },
        images: {}, products: [], events: [], thursday: null,
      };
      const { container, rerender } = render(<Component block={block} />);
      expect(container).toBeEmptyDOMElement();
      rerender(<Component block={{ ...block, data: { ...block.data, show_when_empty: true } }} />);
      expect(screen.getByRole("heading", { name: "Заголовок владельца" })).toBeInTheDocument();
      expect(screen.getByText(/Блок пока заполняется/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /корзину/i })).not.toBeInTheDocument();
      rerender(<Component block={block} />);
      expect(container).toBeEmptyDOMElement();
    });
  }
});
