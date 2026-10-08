"use client";

import { useQuery } from "@tanstack/react-query";

import { inventoryApi, inventoryKeys, qtyFromLabel } from "@/lib/admin/inventory";
import { lookupProducts } from "@/lib/admin/lookup";

export interface StockInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  imageUrl: string | null;
  /** остаток: граммы (чай) или штуки */
  stock: number;
  stockLabel: string;
  /** порог, статус и последняя поставка есть только у товаров из таблицы остатков */
  threshold: number | null;
  thresholdLabel: string | null;
  level: string | null;
  levelLabel: string | null;
  lastSupplyAt: string | null;
}

/**
 * Остаток выбранных товаров числом — чтобы показать «было → станет».
 * Берём из таблицы остатков (общий кэш со вкладкой «Остатки»); товаров, которых там нет
 * (черновики), — из поиска товаров.
 */
export function useStockInfo(ids: string[]) {
  const table = useQuery({ queryKey: inventoryKeys.stock({}), queryFn: () => inventoryApi.stock({}) });
  const rows = new Map((table.data?.items ?? []).map((row) => [row.product_id, row]));
  const missing = table.isSuccess ? ids.filter((id) => !rows.has(id)) : [];
  const extra = useQuery({
    queryKey: inventoryKeys.lookup(missing),
    queryFn: () => lookupProducts({ ids: missing, limit: 100 }),
    enabled: missing.length > 0,
  });

  const info: Record<string, StockInfo> = {};
  for (const id of ids) {
    const row = rows.get(id);
    if (row) {
      info[id] = {
        id,
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
      continue;
    }
    const found = extra.data?.find((p) => p.id === id);
    if (found) {
      info[id] = {
        id,
        name: found.name,
        type: found.type,
        status: found.status,
        imageUrl: found.image_url,
        stock: qtyFromLabel(found.stock_label) ?? 0,
        stockLabel: found.stock_label,
        threshold: null,
        thresholdLabel: null,
        level: null,
        levelLabel: null,
        lastSupplyAt: null,
      };
    }
  }

  const loading = table.isPending || (missing.length > 0 && extra.isPending);
  return { info, loading, table, error: table.error ?? extra.error ?? null };
}
