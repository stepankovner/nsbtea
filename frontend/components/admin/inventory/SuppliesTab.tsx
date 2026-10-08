"use client";

import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyState, QueryState } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { inventoryApi, inventoryKeys, type SuppliesQuery } from "@/lib/admin/inventory";
import { formatDateTime, plural } from "@/lib/format";

import { pageFrom, Pager, useHref } from "./parts";

const PER_PAGE = 30;

/** История поставок: когда, от кого (комментарий), сколько товаров и кто провёл. */
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
            <ul aria-label="Поставки" className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {data.items.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
                  <span className="font-medium tabular-nums md:w-56 md:shrink-0">{formatDateTime(s.posted_at)}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {s.comment ? <span>{s.comment}</span> : <span className="text-muted-foreground">Без комментария</span>}
                  </span>
                  <span className="text-sm text-muted-foreground md:text-right">
                    {s.lines_count} {plural(s.lines_count, "товар", "товара", "товаров")}
                    {s.actor_name ? ` · ${s.actor_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Что именно пришло в каждой поставке, видно во вкладке «История» и на странице товара.
            </p>
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
