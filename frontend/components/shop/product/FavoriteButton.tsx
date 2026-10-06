"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";

/** «В избранное»: гостя отправляем войти и вернуться к товару. */
export function FavoriteButton({ productId, slug, initial = false }: { productId: string; slug: string; initial?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (on) await shopApi.favoriteOff(productId);
      else await shopApi.favoriteOn(productId);
      setOn(!on);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push(`/account/login?next=${encodeURIComponent(`/product/${slug}`)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      className="inline-flex items-center gap-2 self-start text-[15px] text-muted hover:text-red"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill={on ? "#8E3236" : "none"} stroke={on ? "#8E3236" : "currentColor"} strokeWidth="1.6">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
      {on ? "В избранном" : "В избранное"}
    </button>
  );
}
