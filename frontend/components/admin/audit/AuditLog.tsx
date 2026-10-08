"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, History } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";

import { EmptyState, PageHeader, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { OwnerOnly } from "@/components/admin/settings/OwnerOnly";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/errors";
import { auditApi, auditKeys, ENTITY_FILTERS, ENTITY_LABELS, type AuditEntry } from "@/lib/admin/audit";
import { settingsApi, settingsKeys } from "@/lib/admin/settings";
import { addDays, moscowDateInput, staffApi, staffKeys } from "@/lib/admin/staff";
import { formatDate, formatDateTime } from "@/lib/format";

import { CHANGED, diffRows, entryLink, type DiffContext } from "./diff";

const PER_PAGE = 30;

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function dayTitle(day: string): string {
  const today = moscowDateInput();
  if (day === today) return "Сегодня";
  if (day === addDays(today, -1)) return "Вчера";
  return formatDate(`${day}T12:00:00+03:00`);
}

function moscowTime(iso: string): string {
  return formatDateTime(iso).split(", ").pop() ?? "";
}

function EntryView({ entry, ctx }: { entry: AuditEntry; ctx: DiffContext }) {
  const id = useId();
  const rows = diffRows(entry, ctx);
  const link = entryLink(entry);
  return (
    <article aria-labelledby={id} className="flex flex-col gap-1.5 border-b px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <time dateTime={entry.at} className="tabular-nums">
          {moscowTime(entry.at)}
        </time>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-foreground">{entry.actor_name}</span>
        {ENTITY_LABELS[entry.entity] ? <StatusBadge className="ml-auto">{ENTITY_LABELS[entry.entity]}</StatusBadge> : null}
      </div>
      <p id={id} className="text-[15px] font-medium break-words">
        {entry.summary}
      </p>
      {rows.length ? (
        <ul className="flex flex-col gap-1 text-[15px] break-words">
          {rows.map((row) => (
            <li key={row.key}>
              <span className="text-muted-foreground">{row.label}:</span>{" "}
              {row.before === null || row.after === null ? (
                CHANGED
              ) : (
                <>
                  <span className="text-muted-foreground line-through decoration-muted-foreground/50">{row.before}</span> →{" "}
                  <span className="font-medium">{row.after}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {link ? (
        <Link href={link.href} className="flex min-h-10 items-center gap-1 self-start text-sm font-medium underline-offset-2 hover:underline">
          {link.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  );
}

function groupByDay(entries: AuditEntry[]): { day: string; entries: AuditEntry[] }[] {
  const groups: { day: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const day = moscowDateInput(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

function AuditScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAdmin();
  const actor = params.get("actor") ?? "";
  const entity = params.get("entity") ?? "";
  const filters = { ...(entity ? { entity } : {}), ...(actor ? { actor_id: actor } : {}) };

  const staff = useQuery({ queryKey: staffKeys.list, queryFn: staffApi.list });
  const meta = useQuery({ queryKey: settingsKeys.meta, queryFn: settingsApi.meta, staleTime: 5 * 60_000 });
  const log = useInfiniteQuery({
    queryKey: auditKeys.list(filters),
    queryFn: ({ pageParam }) => auditApi.list({ ...filters, page: pageParam, per_page: PER_PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
  });

  const ctx: DiffContext = { settingsMeta: meta.data, permissions: staff.data?.permissions };
  const entries = log.data?.pages.flatMap((p) => p.items) ?? [];
  const total = log.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(actor || entity);

  function setFilter(key: "actor" | "entity", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  }

  const people = staff.data?.items ?? [];
  // сотрудник из ссылки мог пропасть из списка — оставим его в фильтре, чтобы выбор не сбрасывался
  const actorKnown = !actor || people.some((p) => p.id === actor);

  return (
    <>
      <PageHeader
        title="Журнал действий"
        description="Кто, когда и что менял в админке: товары, цены, остатки, заказы, баллы, настройки. Время — московское, новые записи сверху."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-actor" className="text-[15px] font-medium">
            Кто
          </Label>
          <select id="audit-actor" className={SELECT_CLASS} value={actor} onChange={(e) => setFilter("actor", e.target.value)}>
            <option value="">Все — вы и сотрудники</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === user.id ? `${p.name} (вы)` : p.name}
              </option>
            ))}
            {actorKnown ? null : <option value={actor}>Выбранный сотрудник</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-entity" className="text-[15px] font-medium">
            Что менялось
          </Label>
          <select id="audit-entity" className={SELECT_CLASS} value={entity} onChange={(e) => setFilter("entity", e.target.value)}>
            <option value="">Всё</option>
            {ENTITY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        {filtered ? (
          <Link href={pathname} className="flex min-h-10 items-center self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Сбросить фильтры
          </Link>
        ) : null}
      </div>

      {log.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : log.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <p>{errorMessage(log.error)}</p>
          <Button variant="outline" onClick={() => void log.refetch()}>
            Попробовать ещё раз
          </Button>
        </div>
      ) : entries.length ? (
        <div className="flex flex-col gap-5">
          {groupByDay(entries).map((group) => (
            <section key={group.day} aria-labelledby={`audit-day-${group.day}`} className="flex flex-col gap-2">
              <h2 id={`audit-day-${group.day}`} className="text-base font-semibold">
                {dayTitle(group.day)}
              </h2>
              <div className="overflow-hidden rounded-xl border bg-card">
                {group.entries.map((e) => (
                  <EntryView key={e.id} entry={e} ctx={ctx} />
                ))}
              </div>
            </section>
          ))}
          {log.hasNextPage ? (
            <Button variant="outline" size="lg" className="w-full sm:w-auto sm:self-center" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
              {log.isFetchingNextPage ? "Загружаем…" : `Показать ещё (осталось ${total - entries.length})`}
            </Button>
          ) : null}
        </div>
      ) : filtered ? (
        <EmptyState icon={History} title="Ничего не нашлось">
          С такими фильтрами записей нет. Выберите другого сотрудника или раздел — или сбросьте фильтры.
        </EmptyState>
      ) : (
        <EmptyState icon={History} title="Пока пусто">
          Здесь появится каждое действие в админке: кто изменил цену, принял поставку, отменил заказ или начислил баллы.
        </EmptyState>
      )}
    </>
  );
}

export function AuditPage() {
  return (
    <OwnerOnly>
      <AuditScreen />
    </OwnerOnly>
  );
}
