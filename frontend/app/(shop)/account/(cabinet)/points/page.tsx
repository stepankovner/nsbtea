import type { Metadata } from "next";
import clsx from "clsx";

import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { formatDate, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Баллы", robots: { index: false } };

export default async function PointsPage() {
  const wallet = await must((await serverApi()).GET("/api/account/points"));
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="flex flex-col gap-2 border-t border-ink pt-4">
          <span className="font-serif text-[48px] leading-none">{wallet.balance}</span>
          <span className="text-[15px] text-muted">можно потратить (1 балл = 1 ₽)</span>
        </div>
        <div className="flex flex-col gap-2 border-t border-ink pt-4">
          <span className="font-serif text-[48px] leading-none">{wallet.pending}</span>
          <span className="text-[15px] text-muted">ожидают — придут, когда заказ будет выполнен</span>
        </div>
        <div className="flex flex-col gap-2 border-t border-ink pt-4 text-[15px] leading-relaxed text-text2">
          Начисляем 5% от оплаченной суммы. Списать можно до половины стоимости товаров в корзине.
        </div>
      </div>
      <div>
        <h2 className="mb-4 font-serif text-[28px]">История</h2>
        {wallet.history.length ? (
          <ul className="border-t border-ink">
            {wallet.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-8 gap-y-1 border-b border-line py-3.5 text-[15px]">
                <span className="w-[150px] text-muted">{formatDate(h.created_at)}</span>
                <span className="flex-[1_1_220px]">
                  {h.kind_label}
                  {h.order_number ? ` · заказ ${h.order_number}` : ""}
                  {h.comment ? <span className="block text-sm text-muted">{h.comment}</span> : null}
                </span>
                <span className={clsx("min-w-[80px] text-right font-medium", h.delta > 0 ? "text-green" : "text-red")}>
                  {h.delta > 0 ? `+${h.delta}` : `−${Math.abs(h.delta)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[17px] text-text2">
            Пока пусто. После первого выполненного заказа здесь появятся {plural(5, "балл", "балла", "баллов")}.
          </p>
        )}
      </div>
    </div>
  );
}
