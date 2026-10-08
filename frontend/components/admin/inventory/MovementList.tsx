"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyState, QueryState, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { inventoryApi, inventoryKeys, type Movement, type MovementsQuery } from "@/lib/admin/inventory";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MOVEMENT_TONES, pageFrom, Pager, useHref } from "./parts";

const PER_PAGE = 50;

function MovementRow({ m, showProduct, canOrders }: { m: Movement; showProduct: boolean; canOrders: boolean }) {
  const order = m.order_id && m.order_number ? m.order_number : null;
  // у инвентаризации без причины сервер пишет комментарий «Инвентаризация» — не повторяем его
  const comment = m.comment && m.comment !== m.reason_label ? m.comment : null;
  return (
    <li className="flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <span className="flex items-center justify-between gap-3 md:w-48 md:shrink-0 md:flex-col md:items-start md:gap-1">
        <StatusBadge tone={MOVEMENT_TONES[m.reason] ?? "neutral"}>{m.reason_label}</StatusBadge>
        <span className="text-sm text-muted-foreground">{formatDateTime(m.created_at)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {showProduct ? (
          <Link href={`/admin/inventory/${m.product_id}`} className="self-start font-medium hover:underline">
            {m.product_name}
          </Link>
        ) : null}
        {order ? (
          canOrders ? (
            <Link href={`/admin/orders/${m.order_id}`} className="self-start text-[15px] underline underline-offset-2">
              Заказ {order}
            </Link>
          ) : (
            <span className="text-[15px]">Заказ {order}</span>
          )
        ) : null}
        {comment ? <span className="text-[15px] break-words">{comment}</span> : null}
        {m.actor_name ? <span className="text-sm text-muted-foreground">{m.actor_name}</span> : null}
      </span>
      <span className="flex items-baseline justify-between gap-3 md:w-36 md:shrink-0 md:flex-col md:items-end md:gap-0.5">
        <span className={cn("text-lg font-semibold tabular-nums", m.delta > 0 ? "text-emerald-700" : "text-red-700")}>{m.delta_label}</span>
        <span className="text-sm text-muted-foreground tabular-nums">остаток {m.balance_label}</span>
      </span>
    </li>
  );
}

/** История движения: поставки, продажи (со ссылкой на заказ), отмены, возвраты, инвентаризация, списания. */
export function MovementList({ productId, showProduct = false }: { productId?: string; showProduct?: boolean }) {
  const params = useSearchParams();
  const href = useHref();
  const { can } = useAdmin();
  const page = pageFrom(params);
  const query: MovementsQuery = { ...(productId ? { product_id: productId } : {}), page, per_page: PER_PAGE };
  const list = useQuery({ queryKey: inventoryKeys.movements(query), queryFn: () => inventoryApi.movements(query) });

  return (
    <QueryState query={list}>
      {(data) =>
        data.items.length ? (
          <>
            <ul aria-label="История движения" className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {data.items.map((m) => (
                <MovementRow key={m.id} m={m} showProduct={showProduct} canOrders={can("orders")} />
              ))}
            </ul>
            <Pager page={page} total={data.total} perPage={PER_PAGE} href={(p) => href({ page: String(p) })} />
          </>
        ) : (
          <EmptyState icon={History} title="Движений пока не было">
            {productId
              ? "Здесь появятся поставки, продажи, отмены заказов, инвентаризация и списания этого товара."
              : "Здесь появятся все изменения остатков: поставки, продажи, отмены заказов, инвентаризация и списания."}
          </EmptyState>
        )
      }
    </QueryState>
  );
}
