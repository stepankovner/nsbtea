/** Общие элементы страниц админки: заголовок с главным действием, пустые состояния, статусы. */
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {back ? (
        <Link href={back.href} className="flex min-h-9 items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
          {description ? <p className="max-w-2xl text-[15px] text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      {Icon ? <Icon className="size-10 text-muted-foreground" aria-hidden="true" /> : null}
      <p className="text-lg font-medium">{title}</p>
      {children ? <div className="max-w-md text-[15px] text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-foreground/80 border-border",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  brand: "bg-[#8E3236]/10 text-[#8E3236] border-[#8E3236]/20",
};

/** Статус — всегда текстом и цветом (не только цветом, DESIGN.md). */
export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

export const ORDER_STATUS_TONES: Record<string, Tone> = {
  awaiting_payment: "neutral",
  accepted: "info",
  paid: "brand",
  assembling: "warning",
  shipped: "info",
  completed: "success",
  cancelled: "neutral",
  refunded: "neutral",
  needs_attention: "danger",
};

/** Загрузка и ошибка запроса — одинаково на всех экранах. */
export function QueryState<T>({
  query,
  children,
  skeleton = 3,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  skeleton?: number;
}) {
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем">
        {Array.from({ length: skeleton }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
        <p>{errorMessage(query.error)}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Попробовать ещё раз
        </Button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

export function SectionCard({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-xl border bg-card p-4 md:p-5", className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
