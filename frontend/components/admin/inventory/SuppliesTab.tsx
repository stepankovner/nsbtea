"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Truck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { EmptyState, QueryState } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { inventoryApi, inventoryKeys, type MovementsQuery, type SuppliesQuery, type SupplyListItem } from "@/lib/admin/inventory";
import { formatDateTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

import { pageFrom, Pager, useHref } from "./parts";

const PER_PAGE = 30;
/** в одной поставке не больше 200 строк (ограничение сервера) — загружаем все сразу */
const LINES_PER_SUPPLY = 200;

/** Что пришло в одной поставке: товар, сколько и какой стал остаток. */
function SupplyLines({ supply, id }: { supply: SupplyListItem; id: string }) {
  const query: MovementsQuery = { supply_id: supply.id, per_page: LINES_PER_SUPPLY };
  const lines = useQuery({ queryKey: inventoryKeys.movements(query), queryFn: () => inventoryApi.movements(query) });
  return (
    <div id={id} className="border-t bg-muted/30 px-4 py-3">
      <QueryState query={lines} skeleton={Math.min(supply.lines_count || 1, 3)}>
        {(data) => (
          <ul aria-label={`Что пришло: поставка ${formatDateTime(supply.posted_at)}`} className="flex flex-col">
            {data.items.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0">
                <Link href={`/admin/inventory/${m.product_id}`} className="min-w-0 font-medium break-words hover:underline">
                  {m.product_name}
                </Link>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="font-semibold text-emerald-700 tabular-nums">{m.delta_label}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">остаток стал {m.balance_label}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function SupplyRow({ supply }: { supply: SupplyListItem }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted md:items-center"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
          <span className="font-medium tabular-nums md:w-56 md:shrink-0">{formatDateTime(supply.posted_at)}</span>
          <span className="min-w-0 flex-1 break-words">
            {supply.comment ? <span>{supply.comment}</span> : <span className="text-muted-foreground">Без комментария</span>}
          </span>
          <span className="text-sm text-muted-foreground md:text-right">
            {supply.lines_count} {plural(supply.lines_count, "товар", "товара", "товаров")}
            {supply.actor_name ? ` · ${supply.actor_name}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform md:mt-0", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? <SupplyLines supply={supply} id={contentId} /> : null}
    </li>
  );
}

/** История поставок: когда, от кого (комментарий), сколько товаров и кто провёл; нажатие — что пришло. */
export function SuppliesTab() {
  const params = useSearchParams();
  const href = useHref();
  const page = pageFrom(params);
  const query: SuppliesQuery = { page, per_page: PER_PAGE };
  const list = useQuery({ queryKey: inventoryKeys.supplies(query), queryFn: () => inventoryApi.supplies(query) });

  return (
    <QueryState query={list}>
      {(data) =>
        data.items.length ? (
          <>
            <p className="mb-3 text-[15px] text-muted-foreground">Нажмите на поставку, чтобы увидеть, что в ней пришло.</p>
            <ul aria-label="Поставки" className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {data.items.map((s) => (
                <SupplyRow key={s.id} supply={s} />
              ))}
            </ul>
            <Pager page={page} total={data.total} perPage={PER_PAGE} href={(p) => href({ page: String(p) })} />
          </>
        ) : (
          <EmptyState
            icon={Truck}
            title="Поставок пока не было"
            action={
              <Button asChild variant="outline">
                <Link href="/admin/inventory/supply">Принять первую поставку</Link>
              </Button>
            }
          >
            Когда придёт товар, нажмите «Принять поставку» — запись появится здесь.
          </EmptyState>
        )
      }
    </QueryState>
  );
}
