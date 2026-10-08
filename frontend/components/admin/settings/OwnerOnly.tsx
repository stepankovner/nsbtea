"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";

/** Разделы владельца (настройки, сотрудники, уведомления, журнал): сотруднику — понятное объяснение. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { isOwner } = useAdmin();
  if (isOwner) return <>{children}</>;
  return (
    <EmptyState
      icon={Lock}
      title="Этот раздел доступен только владельцу"
      action={
        <Button asChild variant="outline">
          <Link href="/admin">На главную</Link>
        </Button>
      }
    >
      Настройки магазина, доступы сотрудников, уведомления и журнал действий меняет только владелец. Если здесь нужно что-то изменить
      — напишите ему.
    </EmptyState>
  );
}
