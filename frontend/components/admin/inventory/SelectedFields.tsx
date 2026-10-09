"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/errors";

import type { StockInfo, useSelectedStock } from "./useStockInfo";

/** Поля количества для выбранных товаров: загрузка, ошибка, товар убран в архив. */
export function SelectedFields({
  ids,
  stock,
  onRemove,
  children,
}: {
  ids: string[];
  stock: ReturnType<typeof useSelectedStock>;
  onRemove: (id: string) => void;
  children: (info: StockInfo) => ReactNode;
}) {
  if (stock.error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
        <p>{errorMessage(stock.error)}</p>
        <Button type="button" variant="outline" onClick={() => void stock.refetch()}>
          Попробовать ещё раз
        </Button>
      </div>
    );
  }
  if (stock.loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем">
        {ids.map((id) => (
          <Skeleton key={id} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ids.map((id) => {
        const info = stock.info[id];
        return info ? (
          <div key={id} className="rounded-xl border bg-card p-4">
            {children(info)}
          </div>
        ) : (
          <div key={id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-[15px]">
            <span>Товар не найден — возможно, его убрали в архив.</span>
            <Button type="button" variant="outline" onClick={() => onRemove(id)}>
              Убрать
            </Button>
          </div>
        );
      })}
    </div>
  );
}
