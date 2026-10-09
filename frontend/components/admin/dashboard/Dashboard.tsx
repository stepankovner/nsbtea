"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, Inbox, PackageCheck, ShoppingBag, Timer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ORDER_STATUS_TONES, PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { adminApi, must, type Schemas } from "@/lib/admin/client";
import { formatDayTime, formatRub, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useAdmin } from "../session";

type Data = Schemas["DashboardOut"];

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hour12: false, timeZone: "Europe/Moscow" }).format(new Date()));
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function Tile({ href, label, value, icon, tone }: { href: string; label: string; value: number; icon: ReactNode; tone?: "danger" }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[88px] flex-col justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-muted",
        tone === "danger" && value > 0 && "border-red-200 bg-red-50 hover:bg-red-100",
      )}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

export function DashboardView({ data, userName }: { data: Data; userName: string }) {
  const a = data.attention;
  const pending = data.launch_checklist.filter((i) => !i.done);
  const done = data.launch_checklist.length - pending.length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`${greeting()}, ${userName}`} />

      {pending.length ? (
        <section aria-label="Подготовка к запуску" className="rounded-xl border border-amber-200 bg-amber-50 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Подготовка к запуску</h2>
            <span className="text-sm text-amber-900">
              {done} из {data.launch_checklist.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {data.launch_checklist.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex min-h-12 items-start gap-3 rounded-lg px-2 py-2 hover:bg-amber-100">
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
                  )}
                  <span className="flex flex-col">
                    <span className={cn("font-medium", item.done && "text-muted-foreground line-through")}>{item.title}</span>
                    {!item.done && item.hint ? <span className="text-sm text-amber-900/80">{item.hint}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Требует действия" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile href="/admin/orders?status=paid" label="Новые заказы" value={a.new_orders} icon={<ShoppingBag className="size-4" aria-hidden="true" />} />
        <Tile href="/admin/orders?status=assembling" label="Собираются" value={a.assembling} icon={<PackageCheck className="size-4" aria-hidden="true" />} />
        <Tile
          href="/admin/orders?status=needs_attention"
          label="Требуют внимания"
          value={a.needs_attention}
          tone="danger"
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        />
        <Tile href="/admin/orders?status=awaiting_payment" label="Ждут оплаты" value={a.awaiting_payment} icon={<Timer className="size-4" aria-hidden="true" />} />
      </section>

      {/* grid-cols-1 = minmax(0, 1fr): длинная строка с обрезкой не раздвигает экран телефона */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title="Новые заказы" id="dash-orders" action={<Link href="/admin/orders" className="text-sm text-muted-foreground hover:text-foreground">Все заказы</Link>}>
            {data.new_orders.length ? (
              <ul className="-mx-2 flex flex-col">
                {data.new_orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="flex min-h-14 items-center gap-3 rounded-lg px-2 hover:bg-muted">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-mono text-sm">{o.number}</span>
                        <span className="truncate text-sm text-muted-foreground">
                          {o.name} · {formatDayTime(o.created_at)}
                        </span>
                      </span>
                      <StatusBadge tone={ORDER_STATUS_TONES[o.status]}>{o.status_label}</StatusBadge>
                      <span className="w-24 text-right font-medium tabular-nums">{formatRub(o.total_kop)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">
                Пока нет новых заказов. Как только кто-то оплатит — заказ появится здесь, а вам придёт сообщение в Telegram.
              </p>
            )}
          </SectionCard>

          {data.revenue ? (
            <SectionCard title="Выручка" id="dash-revenue">
              <dl className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["Сегодня", data.revenue.today_kop, data.revenue.today_orders, "revenue-today"],
                    ["Неделя", data.revenue.week_kop, data.revenue.week_orders, "revenue-week"],
                    ["Месяц", data.revenue.month_kop, data.revenue.month_orders, "revenue-month"],
                  ] as const
                ).map(([label, kop, count, testId]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums md:text-2xl" data-testid={testId}>
                      {formatRub(kop)}
                    </dd>
                    <dd className="text-xs text-muted-foreground">
                      {count} {plural(count, "заказ", "заказа", "заказов")}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title="Заканчивается" id="dash-stock" action={<Link href="/admin/inventory?tab=reorder" className="text-sm text-muted-foreground hover:text-foreground">Дозаказать</Link>}>
            {data.low_stock.length ? (
              <ul className="-mx-2 flex flex-col">
                {data.low_stock.map((row) => (
                  <li key={row.product_id}>
                    <Link href="/admin/inventory?tab=reorder" className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 hover:bg-muted">
                      <span className="truncate">{row.name}</span>
                      <StatusBadge tone={row.level === "out" ? "danger" : "warning"}>{row.level === "out" ? "нет" : row.stock_label}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">Остатков хватает.</p>
            )}
          </SectionCard>

          <SectionCard title="Чай недели" id="dash-thursdays" action={<Link href="/admin/promotions/thursdays" className="text-sm text-muted-foreground hover:text-foreground">Календарь</Link>}>
            <ul className="flex flex-col gap-1">
              {data.thursdays.map((t) => (
                <li key={t.date} className="flex min-h-10 items-center justify-between gap-3">
                  <span>{t.label}</span>
                  {t.planned ? (
                    <StatusBadge tone="success">
                      {t.products_count} {plural(t.products_count, "чай", "чая", "чаёв")}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">не запланирован</StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Новые заявки" id="dash-apps" action={<Link href="/admin/applications" className="text-sm text-muted-foreground hover:text-foreground">Все</Link>}>
            {data.new_applications.length ? (
              <ul className="-mx-2 flex flex-col">
                {data.new_applications.map((app) => (
                  <li key={app.id}>
                    <Link href={`/admin/applications/${app.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 hover:bg-muted">
                      <span className="flex items-center gap-2">
                        <Inbox className="size-4 text-muted-foreground" aria-hidden="true" />
                        {app.name}
                      </span>
                      <span className="text-sm text-muted-foreground">{app.type_label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">Новых заявок нет.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAdmin();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => must(adminApi.GET("/api/admin/dashboard")),
    refetchInterval: 60_000,
  });
  return <QueryState query={query}>{(data) => <DashboardView data={data} userName={user.name} />}</QueryState>;
}
