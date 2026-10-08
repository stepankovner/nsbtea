"use client";

/** Общие мелочи раздела «Склад»: статусы, миниатюры, шаги, панель действий, страницы, ссылки. */
import { useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode, Ref } from "react";
import { toast } from "sonner";

import { Hint } from "@/components/admin/Hint";
import type { Tone } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, Field } from "@/components/admin/Field";
import { inventoryKeys, isTea, unitLabel } from "@/lib/admin/inventory";
import { cn } from "@/lib/utils";

export const LEVEL_TONES: Record<string, Tone> = { ok: "success", low: "warning", out: "danger" };

export const MOVEMENT_TONES: Record<string, Tone> = {
  supply: "success",
  sale: "neutral",
  cancel: "info",
  refund: "info",
  adjustment: "warning",
  writeoff: "danger",
};

/** Подсказка к порогу малого остатка — одна на весь раздел. */
export function thresholdHint(type?: string): ReactNode {
  const example = type && !isTea(type) ? "2 шт." : "50 г";
  return (
    <>
      Порог — когда остаток дойдёт до этого числа или станет меньше, товар попадёт в «Нужно дозаказать», а на сайте появится
      «Осталось мало». Например, {example}. По умолчанию — 50 г для чая и 2 шт. для посуды и наборов; свой порог для товара
      задаётся в его карточке.
    </>
  );
}

export function ProductThumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- миниатюра из медиатеки
    <img src={src} alt="" className={cn("size-10 shrink-0 rounded-md object-cover", className)} />
  ) : (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md bg-muted", className)}>
      <Package className="size-4 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/** «Шаг 2 из 3» с полоской и заголовком шага. */
export function StepHeader({
  step,
  total,
  title,
  hint,
  headingRef,
}: {
  step: number;
  total: number;
  title: string;
  hint?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm text-muted-foreground">
          Шаг {step} из {total}
        </span>
        <span aria-hidden="true" className="flex flex-1 gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")} />
          ))}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          {title}
        </h2>
        {hint ? <Hint label={title}>{hint}</Hint> : null}
      </div>
    </div>
  );
}

/**
 * Кнопки внизу формы: на телефоне прилипают над нижней панелью и стоят в один ряд,
 * чтобы не закрывать полэкрана; главная кнопка — справа и шире.
 */
export function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(env(safe-area-inset-bottom)+60px)] z-20 -mx-4 mt-6 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur",
        "sm:justify-between md:mx-0 md:rounded-xl md:border md:px-4 lg:bottom-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Крупное поле количества: только цифры, единица («г» или «шт.») — рядом с полем. */
export function QtyField({
  id,
  label,
  type,
  value,
  onChange,
  hint,
  description,
  error,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  description?: ReactNode;
  error?: string | null;
}) {
  return (
    <Field id={id} label={label} hint={hint} description={description} error={error}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="next"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, description)}
          className="h-14 pr-16 text-right text-2xl font-semibold tabular-nums"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-lg text-muted-foreground">
          {unitLabel(type)}
        </span>
      </div>
    </Field>
  );
}

/** Адрес текущей страницы с изменёнными параметрами (номер страницы сбрасывается). */
export function useHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (change: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(change)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in change)) next.delete("page");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
}

export function pageFrom(params: URLSearchParams): number {
  return Math.max(1, Number(params.get("page") ?? "1") || 1);
}

export function Pager({ page, total, perPage, href }: { page: number; total: number; perPage: number; href: (page: number) => string }) {
  if (total <= perPage) return null;
  const pages = Math.ceil(total / perPage);
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={href(page - 1)}>Назад</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">
        Страница {page} из {pages}
      </span>
      {page < pages ? (
        <Button asChild variant="outline">
          <Link href={href(page + 1)}>Дальше</Link>
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** После поставки, инвентаризации или списания: обновить остатки везде, сказать «готово», показать историю. */
export function useAfterStockChange() {
  const client = useQueryClient();
  const router = useRouter();
  return (message: string) => {
    void client.invalidateQueries({ queryKey: inventoryKeys.all });
    void client.invalidateQueries({ queryKey: ["lookup"] });
    void client.invalidateQueries({ queryKey: ["dashboard"] });
    void client.invalidateQueries({ queryKey: ["products"] });
    toast.success(message);
    router.push("/admin/inventory?tab=history");
  };
}

/** id поля количества — чтобы перевести фокус на первое поле с ошибкой. */
export function qtyFieldId(productId: string): string {
  return `qty-${productId}`;
}
