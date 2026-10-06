import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/shop/ui";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { formatDate, formatRub } from "@/lib/format";

export const metadata: Metadata = { title: "Мои заказы", robots: { index: false } };

export default async function OrdersPage() {
  const orders = await must((await serverApi()).GET("/api/account/orders"));
  if (!orders.length) {
    return (
      <div className="flex flex-col items-start gap-6">
        <p className="text-[17px] text-text2">Заказов пока нет. Самое время выбрать чай — за каждый заказ начисляем баллы.</p>
        <Link href="/catalog" className={buttonClass("primary")}>
          В каталог
        </Link>
      </div>
    );
  }
  return (
    <ul className="border-t border-ink">
      {orders.map((o) => (
        <li key={o.id} className="border-b border-line">
          <Link href={`/account/orders/${o.id}`} className="flex flex-wrap items-center gap-x-8 gap-y-2 py-5 hover:bg-block/60">
            <span className="flex min-w-[160px] flex-col">
              <span className="font-mono text-sm">{o.number}</span>
              <span className="text-sm text-muted">{formatDate(o.created_at)}</span>
            </span>
            <span className="flex-[1_1_260px] text-[15px] text-text2">
              {o.items.map((i) => `${i.name}, ${i.variant_label}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join("; ")}
            </span>
            <span className="min-w-[140px] text-[15px]">{o.status_label}</span>
            <span className="min-w-[100px] text-right text-[17px] font-medium">{formatRub(o.total_kop)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
