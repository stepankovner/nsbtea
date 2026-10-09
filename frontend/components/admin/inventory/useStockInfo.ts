"use client";

import { useQuery } from "@tanstack/react-query";

import { inventoryApi, inventoryKeys, type StockRow } from "@/lib/admin/inventory";
import { lookupProducts, type LookupProduct } from "@/lib/admin/lookup";

export interface StockInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  imageUrl: string | null;
  /** остаток: граммы (чай) или штуки */
  stock: number;
  stockLabel: string;
  /** порог, статус и последняя поставка есть только в таблице остатков (без черновиков) */
  threshold: number | null;
  thresholdLabel: string | null;
  level: string | null;
  levelLabel: string | null;
  lastSupplyAt: string | null;
}

function fromLookup(p: LookupProduct): StockInfo {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    imageUrl: p.image_url,
    stock: p.stock,
    stockLabel: p.stock_label,
    threshold: null,
    thresholdLabel: null,
    level: null,
    levelLabel: null,
    lastSupplyAt: null,
  };
}

function fromRow(row: StockRow): StockInfo {
  return {
    id: row.product_id,
    name: row.name,
    type: row.type,
    status: row.status,
    imageUrl: row.image_url,
    stock: row.stock,
    stockLabel: row.stock_label,
    threshold: row.threshold,
    thresholdLabel: row.threshold_label,
    level: row.level,
    levelLabel: row.level_label,
    lastSupplyAt: row.last_supply_at,
  };
}

/**
 * Выбранные товары с остатком числом — для «было → станет» в поставке, инвентаризации и списании.
 * Поиск товаров отдаёт все запрошенные id, включая черновики.
 */
export function useSelectedStock(ids: string[]) {
  const query = useQuery({
    queryKey: inventoryKeys.lookup(ids),
    queryFn: () => lookupProducts({ ids }),
    enabled: ids.length > 0,
  });
  const info: Record<string, StockInfo> = {};
  for (const p of query.data ?? []) info[p.id] = fromLookup(p);
  return { info, loading: ids.length > 0 && query.isPending, error: query.error, refetch: query.refetch };
}

/**
 * Один товар: порог, статус и последняя поставка — из таблицы остатков (общий кэш со вкладкой
 * «Остатки»); черновика там нет — тогда остаток из поиска товаров.
 */
export function useProductStock(id: string) {
  const table = useQuery({ queryKey: inventoryKeys.stock({}), queryFn: () => inventoryApi.stock({}) });
  const row = table.data?.items.find((r) => r.product_id === id);
  const fallback = useQuery({
    queryKey: inventoryKeys.lookup([id]),
    queryFn: () => lookupProducts({ ids: [id] }),
    enabled: table.isSuccess && !row,
  });
  const found = fallback.data?.find((p) => p.id === id);
  const info = row ? fromRow(row) : found ? fromLookup(found) : null;
  const loading = table.isPending || (table.isSuccess && !row && fallback.isPending);
  return { info, loading, table };
}
