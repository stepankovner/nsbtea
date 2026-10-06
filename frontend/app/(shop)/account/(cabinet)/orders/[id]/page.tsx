import type { Metadata } from "next";
import Link from "next/link";

import { OrderActions } from "@/components/shop/account/OrderActions";
import { must } from "@/lib/api/client";
import { orNotFound, serverApi } from "@/lib/api/server";
import { formatDateTime, formatRub, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Заказ", robots: { index: false } };

export default async function AccountOrderPage(props: PageProps<"/account/orders/[id]">) {
  const { id } = await props.params;
  const o = await orNotFound(
    must((await serverApi()).GET("/api/account/orders/{order_id}", { params: { path: { order_id: id } } })),
  );
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Link href="/account" className="text-sm text-muted hover:text-red">
          ← Все заказы
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-serif text-[36px] leading-tight">Заказ {o.number}</h2>
          <span className="text-[15px] text-muted">{formatDateTime(o.created_at)}</span>
        </div>
        <ul className="border-t border-ink">
          {o.items.map((i, index) => (
            <li key={index} className="flex justify-between gap-4 border-b border-line py-3.5 text-[15px]">
              <span className="flex flex-col">
                {i.slug ? (
                  <Link href={`/product/${i.slug}`} className="hover:text-red">
                    {i.name}
                  </Link>
                ) : (
                  <span>{i.name}</span>
                )}
                <span className="font-mono text-xs text-muted">
                  {i.variant_label} × {i.qty}
                </span>
              </span>
              <span className="whitespace-nowrap">{formatRub(i.total_kop)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between">
          <span className="text-[17px]">Итого</span>
          <span className="font-serif text-[32px]">{formatRub(o.total_kop)}</span>
        </div>
      </div>
      <aside className="flex flex-col gap-6 bg-block p-[clamp(20px,3vw,32px)]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[15px]">
          <dt className="text-muted">Статус</dt>
          <dd className="font-medium">{o.status_label}</dd>
          <dt className="text-muted">Доставка</dt>
          <dd>{o.delivery_label}</dd>
          {o.tracking_number ? (
            <>
              <dt className="text-muted">Трек-номер</dt>
              <dd>
                {o.tracking_url ? (
                  <a href={o.tracking_url} target="_blank" rel="noopener noreferrer" className="text-red underline">
                    {o.tracking_number}
                  </a>
                ) : (
                  o.tracking_number
                )}
              </dd>
            </>
          ) : null}
          {o.points_spent ? (
            <>
              <dt className="text-muted">Списано баллов</dt>
              <dd>{o.points_spent}</dd>
            </>
          ) : null}
          {o.points_earned ? (
            <>
              <dt className="text-muted">Начислено</dt>
              <dd className="text-green">
                {o.points_earned} {plural(o.points_earned, "балл", "балла", "баллов")}
              </dd>
            </>
          ) : o.points_to_earn ? (
            <>
              <dt className="text-muted">Будет начислено</dt>
              <dd>
                {o.points_to_earn} {plural(o.points_to_earn, "балл", "балла", "баллов")} после выполнения
              </dd>
            </>
          ) : null}
        </dl>
        <OrderActions orderId={o.id} canPay={o.can_pay} />
      </aside>
    </div>
  );
}
