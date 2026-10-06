"use client";

import Link from "next/link";

import { useCart } from "./cart-context";

/** Подтверждение внизу слева после «В корзину» — ответ на действие, не всплывающее окно. */
export function CartToast() {
  const { toast, hideToast } = useCart();
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex sm:inset-x-auto sm:left-6 sm:bottom-6">
      {toast ? (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex animate-toast-in items-center gap-5 bg-ink px-[18px] py-3.5 text-[15px] text-paper"
        >
          <span>{toast.text}</span>
          {toast.link ? (
            <Link href="/cart" className="whitespace-nowrap text-red-light hover:text-paper" onClick={hideToast}>
              В корзину →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
