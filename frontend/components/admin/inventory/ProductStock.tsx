"use client";

import { ClipboardCheck, PackageMinus, PackagePlus } from "lucide-react";
import Link from "next/link";

import { Hint } from "@/components/admin/Hint";
import { PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

import { MovementList } from "./MovementList";
import { LEVEL_TONES, thresholdHint } from "./parts";
import { useProductStock } from "./useStockInfo";

function Actions({ id }: { id: string }) {
  return (
    <>
      <Button asChild size="lg" className="max-sm:basis-full">
        <Link href={`/admin/inventory/supply?products=${id}`}>
          <PackagePlus aria-hidden="true" />
          Принять поставку
        </Link>
      </Button>
      <Button asChild variant="outline" className="max-sm:flex-1">
        <Link href={`/admin/inventory/count?products=${id}`}>
          <ClipboardCheck aria-hidden="true" />
          Пересчитать
        </Link>
      </Button>
      <Button asChild variant="outline" className="max-sm:flex-1">
        <Link href={`/admin/inventory/writeoff?products=${id}`}>
          <PackageMinus aria-hidden="true" />
          Списать
        </Link>
      </Button>
    </>
  );
}

function statusNote(status: string): string | undefined {
  if (status === "published") return undefined;
  if (status === "draft") return "Черновик — товар ещё не показывается на сайте.";
  if (status === "hidden") return "Товар скрыт с сайта.";
  return "Товар сейчас не показывается на сайте.";
}

/** Склад: один товар — остаток, порог (меняется в карточке товара), действия и история движения. */
export function ProductStock({ id }: { id: string }) {
  const { can } = useAdmin();
  const stock = useProductStock(id);

  return (
    <QueryState query={stock.table}>
      {() => {
        const info = stock.info;
        if (!info) {
          if (stock.loading) {
            return (
              <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            );
          }
          return (
            <>
              <PageHeader
                back={{ href: "/admin/inventory", label: "Склад" }}
                title="Товара нет на складе"
                description="Возможно, его убрали в архив. Ниже — его история движения, если она есть."
              />
              <MovementList productId={id} />
            </>
          );
        }
        return (
          <>
            <PageHeader
              back={{ href: "/admin/inventory", label: "Склад" }}
              title={
                <span className="flex flex-wrap items-center gap-3">
                  {info.name}
                  {info.levelLabel ? <StatusBadge tone={LEVEL_TONES[info.level ?? ""] ?? "neutral"}>{info.levelLabel}</StatusBadge> : null}
                </span>
              }
              description={statusNote(info.status)}
              actions={<Actions id={id} />}
            />

            <SectionCard title="Сейчас на складе" id="product-stock-now" className="mb-5">
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-0.5">
                  <dt className="flex min-h-7 items-center text-sm text-muted-foreground">Остаток</dt>
                  <dd data-testid="stock-now" className="text-2xl font-semibold tabular-nums">
                    {info.stockLabel}
                  </dd>
                </div>
                {/* у черновика порога и последней поставки в таблице остатков нет */}
                {info.threshold !== null ? (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <dt className="flex min-h-7 items-center gap-1 text-sm text-muted-foreground">
                        Порог
                        <Hint label="Порог">{thresholdHint(info.type)}</Hint>
                      </dt>
                      <dd data-testid="stock-threshold" className="text-2xl font-semibold tabular-nums">
                        {info.thresholdLabel ?? "—"}
                      </dd>
                    </div>
                    <div className="col-span-2 flex flex-col gap-0.5 md:col-span-1">
                      <dt className="flex min-h-7 items-center text-sm text-muted-foreground">Последняя поставка</dt>
                      <dd className="text-[15px]">{info.lastSupplyAt ? formatDate(info.lastSupplyAt) : "Поставок ещё не было"}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {info.threshold === null ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Порог и статус «Осталось мало / Нет в наличии» появятся, когда товар покажут на сайте.
                </p>
              ) : null}
              <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
                {can("products") ? (
                  <>
                    Порог меняется в{" "}
                    <Link href={`/admin/products/${id}`} className="text-foreground underline underline-offset-2">
                      карточке товара
                    </Link>
                    .
                  </>
                ) : (
                  "Порог меняется в карточке товара — попросите владельца или сотрудника с доступом к «Товарам»."
                )}
              </p>
            </SectionCard>

            <h2 className="mb-3 text-lg font-semibold">История движения</h2>
            <MovementList productId={id} />
          </>
        );
      }}
    </QueryState>
  );
}
