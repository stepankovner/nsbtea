import { mergeAttributes, Node } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    productCard: {
      insertProductCard: (attrs: { slug: string; name: string }) => ReturnType;
    };
  }
}

/** Карточка товара в тексте: на сайте показывается с актуальной ценой и ссылкой (SPEC 9). */
export const ProductCardNode = Node.create({
  name: "productCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      slug: { default: null },
      name: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-product-card]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-product-card": "",
        class: "my-3 flex items-center gap-3 rounded-lg border border-dashed bg-muted px-3 py-3 text-[15px]",
      }),
      `Карточка товара: ${node.attrs.name || node.attrs.slug}`,
    ];
  },
  addCommands() {
    return {
      insertProductCard:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
