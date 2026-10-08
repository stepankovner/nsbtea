"use client";

import { useQuery } from "@tanstack/react-query";
import { PackageCheck, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState, QueryState, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { inventoryApi, inventoryKeys } from "@/lib/admin/inventory";
import { plural } from "@/lib/format";

import { LEVEL_TONES, ProductThumb, StickyBar } from "./parts";

/** «Нужно дозаказать»: остаток дошёл до порога или закончился. Отмеченные — сразу в «Принять поставку». */
export function ReorderTab() {
  const router = useRouter();
  const list = useQuery({ queryKey: inventoryKeys.reorder, queryFn: () => inventoryApi.reorder() });
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <QueryState query={list}>
      {(data) => {
        if (!data.items.length) {
          return (
            <EmptyState icon={PackageCheck} title="Всего хватает">
              Когда остаток товара дойдёт до порога или закончится, товар появится здесь, а вам придёт сообщение в Telegram.
            </EmptyState>
          );
        }
        const ids = data.items.map((r) => r.product_id);
        // отмеченные — в порядке списка (сначала закончившиеся); пропавшие из списка не берём
        const chosen = ids.filter((id) => selected.includes(id));
        const all = chosen.length === ids.length;
        return (
          <>
            <p className="mb-3 text-[15px] text-muted-foreground">
              Сначала — то, что закончилось. Отметьте товары, которые пришли от поставщика, и нажмите «Принять поставку».
            </p>
            <div className="overflow-hidden rounded-xl border bg-card">
              <Label className="flex min-h-12 cursor-pointer items-center gap-3 border-b bg-muted/50 px-4 text-[15px] leading-snug font-normal">
                <Checkbox
                  checked={all ? true : chosen.length ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? ids : [])}
                  aria-label="Выбрать все"
                />
                Выбрать все
                <span className="ml-auto text-sm text-muted-foreground">
                  {data.items.length} {plural(data.items.length, "товар", "товара", "товаров")}
                </span>
              </Label>
              <ul aria-label="Нужно дозаказать">
                {data.items.map((row) => {
                  const checked = chosen.includes(row.product_id);
                  return (
                    <li key={row.product_id} className="border-b last:border-b-0">
                      {/* на телефоне статус — под названием, чтобы название не обрезалось; на ноутбуке — справа */}
                      <Label className="grid min-h-16 cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 leading-snug font-normal hover:bg-muted md:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSelected((s) => (v === true ? [...s, row.product_id] : s.filter((id) => id !== row.product_id)))
                          }
                          aria-label={`Выбрать: ${row.name}`}
                          className="row-span-2 md:row-span-1"
                        />
                        <ProductThumb src={row.image_url} className="row-span-2 md:row-span-1" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="line-clamp-2 text-[15px] font-medium">{row.name}</span>
                          <span className="text-sm text-muted-foreground">
                            Остаток {row.stock_label} · порог {row.threshold_label}
                          </span>
                        </span>
                        <StatusBadge
                          tone={LEVEL_TONES[row.level] ?? "neutral"}
                          className="col-start-3 justify-self-start md:col-start-4 md:row-start-1 md:justify-self-end"
                        >
                          {row.level_label}
                        </StatusBadge>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <StickyBar className="flex-col-reverse sm:flex-row">
              <span className="text-center text-sm text-muted-foreground sm:text-left">
                {chosen.length
                  ? `Выбрано: ${chosen.length} ${plural(chosen.length, "товар", "товара", "товаров")}`
                  : "Отметьте товары, которые пришли"}
              </span>
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
                disabled={!chosen.length}
                onClick={() => router.push(`/admin/inventory/supply?products=${chosen.join(",")}`)}
              >
                <PackagePlus aria-hidden="true" />
                Принять поставку
              </Button>
            </StickyBar>
          </>
        );
      }}
    </QueryState>
  );
}
