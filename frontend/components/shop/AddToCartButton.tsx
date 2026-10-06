"use client";

import { useState } from "react";

import type { Schemas } from "@/lib/api/client";

import { useCart } from "./cart-context";
import { variantLabel } from "./TeaCard";

/** «В корзину» для варианта по умолчанию (крупные карточки на главной). */
export function AddToCartButton({ product, className }: { product: Schemas["ProductCard"]; className?: string }) {
  const { add } = useCart();
  const [busy, setBusy] = useState(false);
  const variant = product.default_variant;
  return (
    <button
      type="button"
      disabled={!product.in_stock || !variant || busy}
      className={className}
      onClick={async () => {
        if (!variant) return;
        setBusy(true);
        await add(
          { product_id: product.id, kind: variant.kind as Schemas["CartItemIn"]["kind"], grams: variant.grams, qty: 1 },
          variantLabel(product, variant.grams, variant.kind),
          { kop: product.price_kop, name: product.name },
        );
        setBusy(false);
      }}
    >
      {product.in_stock ? "В корзину" : "Нет в наличии"}
    </button>
  );
}
