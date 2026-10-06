"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EmptyState, ORDER_STATUS_TONES, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORDER_TABS, orderKeys, ordersApi } from "@/lib/admin/orders";
import { formatDayTime, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

const PER_PAGE = 30;

export function OrdersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("status");
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const [text, setText] = useState(q);

  const query = { status: status ?? undefined, q: q || undefined, page, per_page: PER_PAGE };
  const list = useQuery({ queryKey: orderKeys.list(query), queryFn: () => ordersApi.list(query), refetchInterval: 60_000 });

  function href(change: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in change)) next.delete("page");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    router.replace(href({ q: text.trim() || null }));
  }

  const counts = list.data?.counts ?? {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Заказы" description="Новые оплаченные заказы — во вкладке «Новые». Нажмите на заказ, чтобы собрать и отправить его." />

      <form role="search" onSubmit={onSearch} className="mb-4 flex gap-2">
        <Input
          type="search"
          aria-label="Поиск заказов"
          placeholder="Номер, телефон или имя"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          Найти
        </Button>
      </form>

      <nav aria-label="Статусы заказов" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {ORDER_TABS.map((tab) => {
          const active = (status ?? null) === tab.value;
          const count = tab.value ? (counts[tab.value] ?? 0) : totalAll;
          if (tab.value && !count && !active && !["paid", "assembling", "shipped"].includes(tab.value)) return null;
          return (
            <Link
              key={tab.label}
              href={href({ status: tab.value })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                tab.value === "needs_attention" && count > 0 && !active && "border-red-300 bg-red-50 text-red-800",
              )}
            >
              {tab.label}
              <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
            </Link>
          );
        })}
      </nav>

      <QueryState query={list}>
        {(data) =>
          data.items.length ? (
            <>
              <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                {data.items.map((o) => (
                  <li key={o.id} className="border-b last:border-b-0">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className={cn("flex flex-col gap-1.5 px-4 py-3.5 hover:bg-muted md:flex-row md:items-center md:gap-4", o.needs_action && "bg-amber-50/40")}
                    >
                      <span className="flex items-center justify-between gap-3 md:w-44 md:flex-col md:items-start md:gap-0.5">
                        <span className="font-mono text-[15px] font-medium">{o.number}</span>
                        <span className="text-sm text-muted-foreground">{formatDayTime(o.created_at)}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate">{o.items_summary}</span>
                        <span className="text-sm text-muted-foreground">
                          {o.name} · {o.delivery_label}
                          {o.payment_method === "on_delivery" ? " · оплата при получении" : ""}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-3 md:justify-end">
                        <StatusBadge tone={ORDER_STATUS_TONES[o.status]}>{o.status_label}</StatusBadge>
                        <span className="w-24 text-right font-medium tabular-nums">{formatRub(o.total_kop)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {data.total > PER_PAGE ? (
                <div className="mt-4 flex items-center justify-between">
                  <Button asChild variant="outline" disabled={page <= 1}>
                    <Link href={href({ page: String(page - 1) })} aria-disabled={page <= 1}>
                      Назад
                    </Link>
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Страница {page} из {Math.ceil(data.total / PER_PAGE)}
                  </span>
                  <Button asChild variant="outline">
                    <Link href={href({ page: String(page + 1) })} aria-disabled={page * PER_PAGE >= data.total}>
                      Дальше
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : status || q ? (
            <EmptyState icon={ShoppingBag} title="Ничего не нашлось">
              Попробуйте другую вкладку или уберите поиск.
            </EmptyState>
          ) : (
            <EmptyState icon={ShoppingBag} title="Пока нет заказов">
              Как только кто-то оплатит — заказ появится здесь, а вам придёт сообщение в Telegram.
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}
