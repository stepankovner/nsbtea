"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, PackageMinus, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { Button } from "@/components/ui/button";
import { INVENTORY_TABS, inventoryApi, inventoryKeys, type InventoryTab } from "@/lib/admin/inventory";
import { cn } from "@/lib/utils";

import { MovementList } from "./MovementList";
import { useHref } from "./parts";
import { ReorderTab } from "./ReorderTab";
import { StockTab } from "./StockTab";
import { SuppliesTab } from "./SuppliesTab";

function tabFrom(value: string | null): InventoryTab {
  return INVENTORY_TABS.some((t) => t.value === value) ? (value as InventoryTab) : "stock";
}

function tabHref(tab: InventoryTab): string {
  return tab === "stock" ? "/admin/inventory" : `/admin/inventory?tab=${tab}`;
}

function HistoryTab() {
  const router = useRouter();
  const params = useSearchParams();
  const href = useHref();
  const product = params.get("product");

  return (
    <>
      <div className="mb-4 flex max-w-xl flex-col gap-2">
        <ProductPicker
          label="Показать только один товар"
          hint="Выберите товар, чтобы увидеть только его поставки, продажи и списания. Например, «Да Хун Пао». Чтобы снова видеть всё — уберите его крестиком."
          value={product ? [product] : []}
          onChange={(ids) => {
            // новый выбор заменяет прежний: фильтр — по одному товару
            const next = ids.find((id) => id !== product) ?? (product && ids.includes(product) ? product : null);
            router.replace(href({ product: next }));
          }}
        />
        {product ? (
          <Link href={`/admin/inventory/${product}`} className="self-start text-sm underline underline-offset-2">
            Остаток и порог этого товара
          </Link>
        ) : null}
      </div>
      <MovementList productId={product ?? undefined} showProduct={!product} />
    </>
  );
}

/** Склад (SPEC 10.4): остатки, «нужно дозаказать», поставки, история; главные действия — сверху. */
export function InventoryView() {
  const params = useSearchParams();
  const tab = tabFrom(params.get("tab"));
  const reorder = useQuery({ queryKey: inventoryKeys.reorder, queryFn: () => inventoryApi.reorder() });
  const reorderCount = reorder.data?.items.length;

  return (
    <>
      <PageHeader
        title="Склад"
        description="Остаток чая — в граммах, посуды и наборов — в штуках. Пришёл товар — нажмите «Принять поставку»."
        actions={
          <>
            <Button asChild size="lg" className="max-sm:basis-full">
              <Link href="/admin/inventory/supply">
                <PackagePlus aria-hidden="true" />
                Принять поставку
              </Link>
            </Button>
            <Button asChild variant="outline" className="max-sm:flex-1">
              <Link href="/admin/inventory/count">
                <ClipboardCheck aria-hidden="true" />
                Инвентаризация
              </Link>
            </Button>
            <Button asChild variant="outline" className="max-sm:flex-1">
              <Link href="/admin/inventory/writeoff">
                <PackageMinus aria-hidden="true" />
                Списание
              </Link>
            </Button>
          </>
        }
      />

      <nav aria-label="Разделы склада" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {INVENTORY_TABS.map((t) => {
          const active = t.value === tab;
          const attention = t.value === "reorder" && !!reorderCount;
          return (
            <Link
              key={t.value}
              href={tabHref(t.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                attention && !active && "border-amber-300 bg-amber-50 text-amber-900",
              )}
            >
              {t.label}
              {t.value === "reorder" && reorderCount !== undefined ? (
                <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{reorderCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {tab === "stock" ? <StockTab /> : null}
      {tab === "reorder" ? <ReorderTab /> : null}
      {tab === "supplies" ? <SuppliesTab /> : null}
      {tab === "history" ? <HistoryTab /> : null}
    </>
  );
}
