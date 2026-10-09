"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QUICK_PERIODS } from "@/lib/admin/audit";
import { addDays, moscowDateInput } from "@/lib/admin/staff";
import { cn } from "@/lib/utils";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_KEYS = ["period", "from", "to"] as const;

function validDate(value: string | null): string | null {
  return value && DATE.test(value) ? value : null;
}

/** Период из адреса → дни для запроса (по Москве, обе границы включительно). */
export function periodRange(params: URLSearchParams): { date_from?: string; date_to?: string } {
  const quick = QUICK_PERIODS.find((p) => p.value === params.get("period"));
  if (quick) {
    const today = moscowDateInput();
    return { date_from: addDays(today, -(quick.days - 1)), date_to: today };
  }
  const from = validDate(params.get("from"));
  const to = validDate(params.get("to"));
  return { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) };
}

export function hasPeriod(params: URLSearchParams): boolean {
  return PERIOD_KEYS.some((k) => params.get(k));
}

const PILL = "flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm";
const PILL_ON = "border-foreground bg-foreground text-background";
const PILL_OFF = "bg-card hover:bg-muted";

/**
 * Период: «Всё время», «Сегодня», «7 дней», «30 дней» — ссылками (вариант хранится в адресе
 * и не устаревает), «Свои даты» — два поля «С» и «По».
 */
export function PeriodFilter({
  params,
  pathname,
  replace,
}: {
  params: URLSearchParams;
  pathname: string;
  replace: (href: string) => void;
}) {
  const period = QUICK_PERIODS.some((p) => p.value === params.get("period")) ? params.get("period") : null;
  const from = validDate(params.get("from")) ?? "";
  const to = validDate(params.get("to")) ?? "";
  const [open, setOpen] = useState(false);
  const custom = open || Boolean(from || to);

  function href(change: Record<string, string | null>): string {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  const allTime = !period && !from && !to;
  const today = moscowDateInput();

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span id="audit-period-label" className="text-[15px] font-medium">
        Период
      </span>
      <nav aria-labelledby="audit-period-label" className="flex flex-wrap gap-1.5">
        <Link
          href={href({ period: null, from: null, to: null })}
          aria-current={allTime ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={cn(PILL, allTime && !open ? PILL_ON : PILL_OFF)}
        >
          Всё время
        </Link>
        {QUICK_PERIODS.map((p) => (
          <Link
            key={p.value}
            href={href({ period: p.value, from: null, to: null })}
            aria-current={period === p.value ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={cn(PILL, period === p.value ? PILL_ON : PILL_OFF)}
          >
            {p.label}
          </Link>
        ))}
        <button type="button" aria-pressed={custom} onClick={() => setOpen(true)} className={cn(PILL, custom ? PILL_ON : PILL_OFF)}>
          Свои даты
        </button>
      </nav>
      {custom ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid max-w-md grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-from" className="text-sm text-muted-foreground">
                С
              </Label>
              <Input
                id="audit-from"
                type="date"
                value={from}
                max={to || today}
                onChange={(e) => replace(href({ period: null, from: validDate(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-to" className="text-sm text-muted-foreground">
                По
              </Label>
              <Input
                id="audit-to"
                type="date"
                value={to}
                min={from || undefined}
                max={today}
                onChange={(e) => replace(href({ period: null, to: validDate(e.target.value) }))}
              />
            </div>
          </div>
          {from && to && from > to ? (
            <p className="text-sm text-destructive">Дата «С» позже даты «По» — так записей не будет. Поменяйте даты местами.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Оба дня включительно, по московскому времени. Можно указать только начало или только конец.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
