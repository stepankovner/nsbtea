"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Hint } from "@/components/admin/Hint";
import { EmptyState, QueryState, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inventoryApi, inventoryKeys, type StockQuery, type StockRow } from "@/lib/admin/inventory";
import { formatDate } from "@/lib/format";

import { LEVEL_TONES, ProductThumb, thresholdHint, useHref } from "./parts";

/** Строка остатков: на телефоне — карточка, на ноутбуке — строка таблицы с колонками. */
function StockRowLink({ row }: { row: StockRow }) {
  return (
    <Link
      href={`/admin/inventory/${row.product_id}`}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted md:grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_9.5rem_11rem] md:gap-x-4"
    >
      <ProductThumb src={row.image_url} className="row-span-2 self-start md:order-1 md:row-span-1 md:self-center" />
      <span className="flex min-w-0 flex-col md:order-2">
        <span className="line-clamp-2 font-medium">{row.name}</span>
        {row.status !== "published" ? <span className="text-xs text-muted-foreground">скрыт с сайта</span> : null}
      </span>
      <StatusBadge tone={LEVEL_TONES[row.level] ?? "neutral"} className="justify-self-end md:order-5 md:justify-self-start">
        {row.level_label}
      </StatusBadge>
      <span className="col-span-2 col-start-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-muted-foreground md:contents">
        <span className="md:order-3 md:text-right">
          <span className="md:sr-only">Остаток </span>
          <span className="text-base font-semibold text-foreground tabular-nums">{row.stock_label}</span>
        </span>
        <span className="md:order-4 md:text-right">
          <span className="md:sr-only">порог </span>
          <span className="tabular-nums md:text-[15px] md:text-foreground">{row.threshold_label}</span>
        </span>
        <span className="basis-full md:order-6 md:basis-auto md:text-[15px]">
          {row.last_supply_at ? (
            <>
              <span className="md:sr-only">Последняя поставка: </span>
              {formatDate(row.last_supply_at)}
            </>
          ) : (
            "Поставок не было"
          )}
        </span>
      </span>
    </Link>
  );
}

export function StockTab() {
  const router = useRouter();
  const params = useSearchParams();
  const href = useHref();
  const { can } = useAdmin();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const query: StockQuery = q ? { q } : {};
  const list = useQuery({ queryKey: inventoryKeys.stock(query), queryFn: () => inventoryApi.stock(query) });

  function onSearch(event: FormEvent) {
    event.preventDefault();
    router.replace(href({ q: text.trim() || null }));
  }

  return (
    <>
      <form role="search" onSubmit={onSearch} className="mb-3 flex gap-2">
        <Input
          type="search"
          aria-label="Поиск по складу"
          placeholder="Название товара"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          Найти
        </Button>
      </form>
      <p className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
        Статус считается по порогу малого остатка
        <Hint label="Порог">{thresholdHint()}</Hint>
      </p>

      <QueryState query={list}>
        {(data) =>
          data.items.length ? (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div
                aria-hidden="true"
                className="hidden grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_9.5rem_11rem] gap-x-4 border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground md:grid"
              >
                <span />
                <span>Товар</span>
                <span className="text-right">Остаток</span>
                <span className="text-right">Порог</span>
                <span>Статус</span>
                <span>Последняя поставка</span>
              </div>
              <ul aria-label="Остатки">
                {data.items.map((row) => (
                  <li key={row.product_id} className="border-b last:border-b-0">
                    <StockRowLink row={row} />
                  </li>
                ))}
              </ul>
            </div>
          ) : q ? (
            <EmptyState icon={Boxes} title="Ничего не нашлось">
              Проверьте название или уберите поиск.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Boxes}
              title="На складе пока ничего нет"
              action={
                can("products") ? (
                  <Button asChild variant="outline">
                    <Link href="/admin/products">Перейти к товарам</Link>
                  </Button>
                ) : undefined
              }
            >
              Сначала добавьте товары в разделе «Товары», потом нажмите «Принять поставку» — остатки появятся здесь.
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}
