"use client";

/** Общие мелочи разделов «Сайт» и «Заявки»: нет доступа, фильтры-«таблетки», панель сохранения, предпросмотр. */
import { Eye, Lock } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { EmptyState } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Permission } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

const SECTION_NAMES: Record<string, string> = {
  content: "Сайт: страницы и события",
  applications: "Заявки",
};

/** Экран раздела показываем, только если у сотрудника есть право; иначе — объяснение. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useAdmin();
  if (can(permission)) return <>{children}</>;
  return (
    <EmptyState icon={Lock} title="Нет доступа к этому разделу">
      Раздел «{SECTION_NAMES[permission] ?? permission}» вам не открыт. Если он нужен для работы —
      попросите владельца добавить это право в «Сотрудниках».
    </EmptyState>
  );
}

export interface Chip {
  key: string;
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

/** Ряд фильтров-ссылок. На телефоне прокручивается вбок сам ряд, а не вся страница. */
export function FilterChips({
  label,
  chips,
  className,
}: {
  label: string;
  chips: Chip[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0",
        className,
      )}
    >
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-current={chip.active ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px]",
            chip.active
              ? "border-foreground bg-foreground text-background"
              : "bg-card hover:bg-muted",
          )}
        >
          {chip.label}
          {chip.count !== undefined ? (
            <span
              className={cn("tabular-nums", chip.active ? "opacity-80" : "text-muted-foreground")}
            >
              {chip.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Панель главного действия длинной формы: всегда видна внизу экрана (на телефоне — над нижним меню),
 * рядом — состояние сохранения.
 */
export function SaveBar({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] z-20 mt-6 lg:bottom-4">
      <div className="flex flex-col gap-1.5 rounded-xl border bg-card/95 p-2.5 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-3">
        <p
          role="status"
          aria-live="polite"
          className="min-h-5 px-0.5 text-[13px] leading-snug text-muted-foreground sm:text-sm"
        >
          {status}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * «Как это увидит покупатель»: витринная вёрстка в окне. Внутри всё неактивно (inert) —
 * кнопки и формы витрины не нажимаются, заявки из предпросмотра не уходят.
 */
export function PreviewButton({ children, note }: { children: () => ReactNode; note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Eye aria-hidden="true" />
        Как это увидит покупатель
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,calc(100%-2rem))]"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3 text-left">
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle className="text-base">Как это увидит покупатель</DialogTitle>
              <DialogDescription className="text-sm">
                {note ??
                  "Так страница выглядит на сайте. Нажимать здесь ничего не нужно — это только просмотр."}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Закрыть
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="overflow-y-auto overflow-x-hidden bg-paper text-ink">
            <div inert>{open ? children() : null}</div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
