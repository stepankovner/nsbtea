"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatRub, plural } from "@/lib/format";
import { shopApi } from "@/lib/shop-api";

import { buttonClass } from "./ui";

type Status = Schemas["OrderStatusOut"];

const POLL_MS = 3_000;
const POLL_LIMIT = 40; // ~2 минуты, дальше — сверка на сервере, покупателю предлагаем повтор
const PAID = new Set(["paid", "assembling", "shipped", "completed"]);

export function OrderResult({
  orderId,
  failed = false,
  navigate = (url: string) => window.location.assign(url),
}: {
  orderId: string;
  failed?: boolean;
  navigate?: (url: string) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [polls, setPolls] = useState(0);

  const load = useCallback(
    () =>
      shopApi.orderStatus(orderId).then(
        (next) => {
          setStatus(next);
          setError(null);
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
    [orderId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = status?.status === "awaiting_payment" && !failed;
  useEffect(() => {
    if (!waiting || polls >= POLL_LIMIT) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      void load();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, status, polls, load]);

  async function retry() {
    setRetrying(true);
    try {
      const { payment_url } = await shopApi.retryPayment(orderId);
      navigate(payment_url);
    } catch (e) {
      setError(errorMessage(e));
      setRetrying(false);
    }
  }

  if (!status) {
    return (
      <Shell kicker="Заказ" title={error ? "Не удалось загрузить заказ" : "Загружаем заказ…"}>
        {error ? <p className="text-[17px] text-text2">{error}</p> : null}
      </Shell>
    );
  }

  const kicker = `Заказ № ${status.number}`;
  const timedOut = polls >= POLL_LIMIT;

  if (PAID.has(status.status) || status.status === "accepted") {
    return (
      <Shell kicker={kicker} title={status.paid ? "Спасибо, заказ оплачен" : "Спасибо, заказ принят"}>
        <p className="max-w-[520px] text-[17px] leading-relaxed text-text2">
          Письмо с составом заказа уже на почте. Когда соберём и передадим в доставку — напишем ещё раз.
        </p>
        <OrderItems status={status} />
        {status.points_to_earn > 0 ? (
          <p className="text-[15px] text-green">
            Когда заказ будет выполнен, начислим {status.points_to_earn}{" "}
            {plural(status.points_to_earn, "балл", "балла", "баллов")} — ими можно оплатить следующий заказ.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Link href={`/account/orders/${status.order_id}`} className={buttonClass("outline")}>
            Заказ в личном кабинете
          </Link>
          <Link href="/catalog" className={buttonClass("link", "px-2")}>
            Вернуться в каталог
          </Link>
        </div>
      </Shell>
    );
  }

  if (status.status === "cancelled") {
    return (
      <Shell kicker={kicker} title="Заказ отменён">
        <p className="max-w-[520px] text-[17px] text-text2">
          Оплата не поступила вовремя, поэтому заказ отменён, а товары вернулись на склад. Можно оформить заказ заново.
        </p>
        <Link href="/catalog" className={buttonClass("outline")}>
          Вернуться в каталог
        </Link>
      </Shell>
    );
  }

  if (status.status === "refunded") {
    return (
      <Shell kicker={kicker} title="Деньги за заказ возвращены">
        <Link href="/catalog" className={buttonClass("outline")}>
          Вернуться в каталог
        </Link>
      </Shell>
    );
  }

  if (status.status === "needs_attention") {
    return (
      <Shell kicker={kicker} title="Оплата получена, проверяем заказ">
        <p className="max-w-[520px] text-[17px] text-text2">
          Мы свяжемся с вами в ближайшее время. Если что-то срочно — напишите нам в Telegram.
        </p>
      </Shell>
    );
  }

  // ожидает оплаты
  if (failed || timedOut) {
    return (
      <Shell kicker={kicker} title="Оплата не прошла">
        <p className="max-w-[520px] text-[17px] text-text2">
          {timedOut
            ? "Банк пока не подтвердил оплату. Если деньги списались — ничего делать не нужно, заказ обновится сам."
            : "Деньги не списаны. Товары за вами ещё 30 минут — можно попробовать оплатить снова."}
        </p>
        <OrderItems status={status} />
        {error ? (
          <p role="alert" className="text-[15px] text-red">
            {error}
          </p>
        ) : null}
        {status.can_retry ? (
          <button type="button" onClick={retry} disabled={retrying} className={buttonClass("primary")}>
            {retrying ? "Открываем оплату…" : "Попробовать ещё раз"}
          </button>
        ) : null}
      </Shell>
    );
  }

  return (
    <Shell kicker={kicker} title="Проверяем оплату…">
      <p className="max-w-[520px] text-[17px] text-text2">Обычно это занимает несколько секунд. Страница обновится сама.</p>
      <OrderItems status={status} />
    </Shell>
  );
}

function Shell({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <section className="container-site flex flex-col items-start gap-7 py-[clamp(64px,9vw,140px)]">
      <span className="kicker text-green">{kicker}</span>
      <h1 className="font-serif text-[clamp(44px,7vw,96px)] leading-[0.95]">{title}</h1>
      {children}
    </section>
  );
}

function OrderItems({ status }: { status: Status }) {
  return (
    <div className="w-full max-w-[560px] border-t border-ink">
      <ul>
        {status.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex justify-between gap-4 border-b border-line py-3 text-[15px]">
            <span className="flex flex-col">
              <span>{item.name}</span>
              <span className="font-mono text-xs text-muted">
                {item.variant_label} × {item.qty}
              </span>
            </span>
            <span className="whitespace-nowrap">{formatRub(item.total_kop)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between py-3 text-[15px]">
        <span className="text-muted">{status.delivery_label}</span>
        <span>{status.delivery_kop ? formatRub(status.delivery_kop) : "бесплатно"}</span>
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[17px]">Итого</span>
        <span className="font-serif text-[30px]">{formatRub(status.total_kop)}</span>
      </div>
    </div>
  );
}
