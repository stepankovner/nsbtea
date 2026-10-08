"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Coins, Package, Receipt, Search, Store, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader, QueryState } from "@/components/admin/page";
import { NAV, PROFILE } from "@/lib/admin/nav";
import { SETTINGS_GROUPS, settingsApi, settingsKeys, type SettingsGroupKey } from "@/lib/admin/settings";

import { OwnerOnly } from "./OwnerOnly";
import { groupTitle } from "./schema";

const GROUP_ICONS: Record<SettingsGroupKey, LucideIcon> = {
  store: Store,
  catalog: Package,
  loyalty: Coins,
  thursday: CalendarDays,
  delivery: Truck,
  payment: Receipt,
  seo: Search,
};

/** Соседние разделы владельца — подписи и значки как в меню. */
const RELATED: { href: string; description: string }[] = [
  { href: "/admin/staff", description: "Временный доступ для помощника: какие разделы ему видны и до какого числа." },
  { href: "/admin/notifications", description: "Кому бот магазина присылает новые заказы, заявки и остатки." },
  { href: "/admin/audit", description: "Кто, когда и что менял в админке." },
  { href: PROFILE.href, description: "Ваш пароль и Telegram для кодов входа." },
];

function Row({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return (
    <li className="border-b last:border-b-0">
      <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3.5 hover:bg-muted">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function SettingsHomeView() {
  const meta = useQuery({ queryKey: settingsKeys.meta, queryFn: settingsApi.meta, staleTime: 5 * 60_000 });
  const related = RELATED.map((r) => {
    const item = [...NAV, PROFILE].find((n) => n.href === r.href);
    return item ? { ...r, title: item.label, icon: item.icon } : null;
  }).filter((r) => r !== null);

  return (
    <>
      <PageHeader
        title="Настройки"
        description="Как работает магазин: контакты, баллы, доставка, чеки. Откройте нужный раздел, поменяйте значения и нажмите «Сохранить»."
      />
      <QueryState query={meta}>
        {(data) => (
          <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {SETTINGS_GROUPS.map((g) => (
              <Row
                key={g.key}
                href={`/admin/settings/${g.key}`}
                icon={GROUP_ICONS[g.key]}
                title={groupTitle(g.key, data) ?? g.key}
                description={g.description}
              />
            ))}
          </ul>
        )}
      </QueryState>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Доступы и уведомления</h2>
      <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {related.map((r) => (
          <Row key={r.href} href={r.href} icon={r.icon} title={r.title} description={r.description} />
        ))}
      </ul>
    </>
  );
}

export function SettingsHome() {
  return (
    <OwnerOnly>
      <SettingsHomeView />
    </OwnerOnly>
  );
}
