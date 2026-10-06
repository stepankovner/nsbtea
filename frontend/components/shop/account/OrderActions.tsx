"use client";

import Link from "next/link";
import { useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";

import { buttonClass } from "../ui";

export function OrderActions({
  orderId,
  canPay,
  navigate = (url: string) => window.location.assign(url),
}: {
  orderId: string;
  canPay: boolean;
  navigate?: (url: string) => void;
}) {
  const [result, setResult] = useState<Schemas["RepeatOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function repeat() {
    setBusy(true);
    setError(null);
    try {
      setResult(await shopApi.repeatOrder(orderId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setBusy(true);
    try {
      const { payment_url } = await shopApi.retryPayment(orderId);
      navigate(payment_url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {canPay ? (
          <button type="button" onClick={pay} disabled={busy} className={buttonClass("primary")}>
            Оплатить
          </button>
        ) : null}
        <button type="button" onClick={repeat} disabled={busy} className={buttonClass("outline")}>
          Повторить заказ
        </button>
      </div>
      {result ? (
        <div className="flex flex-col gap-2 text-[15px]" role="status">
          {result.added.length ? <p className="text-green">Положили в корзину: {result.added.join(", ")}</p> : null}
          {result.unavailable.length ? <p className="text-red">Нет в наличии: {result.unavailable.join(", ")}</p> : null}
          {result.added.length ? (
            <Link href="/cart" className="self-start text-red underline">
              Перейти в корзину
            </Link>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[15px] text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
