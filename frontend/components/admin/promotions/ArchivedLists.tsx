"use client";

/** Архив акций и промокодов: что убрано, и кнопка «Восстановить» (вернётся выключенным). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

import { QueryState, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import {
  discountText,
  periodText,
  promoCodeConditions,
  promoCodeStatus,
  promotionKeys,
  promotionsApi,
  promotionStatus,
  scopeText,
  usageText,
  type PromoCode,
  type Promotion,
} from "@/lib/admin/promotions";
import { cn } from "@/lib/utils";

export type View = "active" | "archive";

/** «Текущие» или «Архив» — крупные кнопки-переключатели (удобно пальцем). */
export function ViewSwitch({ value, onChange, label }: { value: View; onChange: (view: View) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="mb-3 flex gap-1.5">
      {(["active", "archive"] as const).map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={cn(
            "flex min-h-11 items-center rounded-full border px-4 text-sm",
            value === view ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
          )}
        >
          {view === "active" ? "Текущие" : "Архив"}
        </button>
      ))}
    </div>
  );
}

export const LIST_CLASS = "-mx-4 -mb-4 flex flex-col overflow-hidden rounded-b-xl border-t md:-mx-5 md:-mb-5";
const ROW_CLASS = "flex flex-col gap-2.5 border-b px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between md:px-5";

function RestoreButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" className="w-full shrink-0 sm:w-auto" aria-label={label} disabled={disabled} onClick={onClick}>
      <ArchiveRestore aria-hidden="true" />
      Восстановить
    </Button>
  );
}

export function ArchivedPromotions() {
  const client = useQueryClient();
  const archived = useQuery({ queryKey: promotionKeys.archived, queryFn: () => promotionsApi.listArchived() });
  const restore = useMutation({
    mutationFn: (promotion: Promotion) => promotionsApi.restore(promotion.id),
    onSuccess: (_, promotion) => {
      void client.invalidateQueries({ queryKey: promotionKeys.list });
      void client.invalidateQueries({ queryKey: promotionKeys.archived });
      toast.success(`Акция «${promotion.title}» возвращена из архива. Она выключена — включите её в карточке акции, когда понадобится.`);
    },
  });
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Акции из архива не действуют. Восстановленная акция вернётся выключенной — включите её в карточке, когда понадобится.
      </p>
      <QueryState query={archived}>
        {(items) =>
          items.length ? (
            <ul className={LIST_CLASS}>
              {items.map((p) => {
                const status = promotionStatus(p);
                return (
                  <li key={p.id} className={ROW_CLASS}>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-medium break-words">{p.title}</span>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                        <span className="font-semibold text-muted-foreground">{discountText(p.percent, p.amount_kop)}</span>
                        <span className="min-w-0 break-words">{scopeText(p.products, p.categories, "—")}</span>
                      </span>
                      <span className="text-sm text-muted-foreground">{periodText(p.starts_at, p.ends_at)}</span>
                      <span className="text-sm text-muted-foreground">Применили: {usageText(p.stats)}</span>
                    </span>
                    <RestoreButton label={`Восстановить: ${p.title}`} disabled={restore.isPending} onClick={() => restore.mutate(p)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] text-muted-foreground">В архиве пусто.</p>
          )
        }
      </QueryState>
    </>
  );
}

export function ArchivedCodes() {
  const client = useQueryClient();
  const archived = useQuery({ queryKey: promotionKeys.codesArchived, queryFn: () => promotionsApi.codesArchived() });
  const restore = useMutation({
    mutationFn: (code: PromoCode) => promotionsApi.restoreCode(code.id),
    onSuccess: (_, code) => {
      void client.invalidateQueries({ queryKey: promotionKeys.codes });
      void client.invalidateQueries({ queryKey: promotionKeys.codesArchived });
      toast.success(`Промокод ${code.code} возвращён из архива. Он выключен — включите его в карточке промокода, когда понадобится.`);
    },
  });
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Промокоды из архива не работают. Восстановленный код вернётся выключенным — включите его в карточке, когда понадобится.
      </p>
      <QueryState query={archived}>
        {(items) =>
          items.length ? (
            <ul className={LIST_CLASS}>
              {items.map((c) => {
                const status = promoCodeStatus(c);
                const conditions = promoCodeConditions(c);
                return (
                  <li key={c.id} className={ROW_CLASS}>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-mono text-[17px] font-semibold tracking-wide break-all">{c.code}</span>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
                        <span className="font-semibold text-muted-foreground">{discountText(c.percent, c.amount_kop)}</span>
                        <span className="min-w-0 break-words">{scopeText(c.products, c.categories)}</span>
                      </span>
                      {conditions.length ? <span className="text-sm">{conditions.join(" · ")}</span> : null}
                      <span className="text-sm text-muted-foreground">Использовали: {usageText(c.stats)}</span>
                    </span>
                    <RestoreButton label={`Восстановить промокод ${c.code}`} disabled={restore.isPending} onClick={() => restore.mutate(c)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px] text-muted-foreground">В архиве пусто.</p>
          )
        }
      </QueryState>
    </>
  );
}
