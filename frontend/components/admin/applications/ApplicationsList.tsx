"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarDays, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { FilterChips, RequirePermission } from "@/components/admin/content/shared";
import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_STATUS_TONES,
  APPLICATION_STATUSES,
  APPLICATION_TYPES,
  applicationKeys,
  applicationsApi,
  applicationSubject,
  type Application,
} from "@/lib/admin/applications";
import { formatDayTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

const PER_PAGE = 30;

/** Название события берём из самих заявок: право «Заявки» не даёт смотреть раздел «Сайт». */
function eventTitle(items: Application[]): string | null {
  return items.find((a) => a.event_title)?.event_title ?? null;
}

function Row({ app }: { app: Application }) {
  const subject = applicationSubject(app);
  const contact = app.phone ? formatPhone(app.phone) : app.telegram ? `@${app.telegram}` : "";
  return (
    <li className="border-b last:border-b-0">
      <Link
        href={`/admin/applications/${app.id}`}
        className={cn(
          "flex flex-col gap-1.5 px-4 py-3.5 hover:bg-muted md:flex-row md:items-center md:gap-4",
          app.status === "new" && "bg-amber-50/40",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{app.name}</span>
          {subject ? <span className="truncate text-[15px]">{subject}</span> : null}
          <span className="text-sm text-muted-foreground">
            <span>{app.type_label}</span> · {formatDayTime(app.created_at)}
          </span>
        </span>
        <span className="flex items-center justify-between gap-3 md:justify-end">
          {contact ? <span className="text-sm text-muted-foreground">{contact}</span> : null}
          <StatusBadge tone={APPLICATION_STATUS_TONES[app.status]}>{app.status_label}</StatusBadge>
        </span>
      </Link>
    </li>
  );
}

function ListContent() {
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("status");
  const type = params.get("type");
  const eventId = params.get("event_id");
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const query = {
    status: status ?? undefined,
    type: type ?? undefined,
    event_id: eventId ?? undefined,
    page,
    per_page: PER_PAGE,
  };
  const list = useQuery({
    queryKey: applicationKeys.list(query),
    queryFn: () => applicationsApi.list(query),
    refetchInterval: 60_000,
    // при смене фильтра оставляем прежний список, пока грузится новый, — без мигания
    placeholderData: keepPreviousData,
  });

  function href(change: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in change)) next.delete("page");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  const counts = list.data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const statusChips = [
    { key: "all", label: "Все", href: href({ status: null }), active: !status, count: all },
    ...APPLICATION_STATUSES.map((s) => ({
      key: s.value,
      label: s.tab,
      href: href({ status: s.value }),
      active: status === s.value,
      count: counts[s.value] ?? 0,
    })),
  ];
  if ((counts.cancelled ?? 0) > 0 || status === "cancelled") {
    statusChips.push({
      key: "cancelled",
      label: "Отменённые",
      href: href({ status: "cancelled" }),
      active: status === "cancelled",
      count: counts.cancelled ?? 0,
    });
  }
  const typeChips = [
    { key: "all", label: "Все виды", href: href({ type: null }), active: !type },
    ...APPLICATION_TYPES.map((t) => ({
      key: t.value,
      label: t.label,
      href: href({ type: t.value }),
      active: type === t.value,
    })),
  ];

  return (
    <>
      <QueryState query={list}>
        {(data) => (
          <>
            {eventId ? (
              <div
                role="status"
                aria-label="Фильтр по событию"
                className="mb-4 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-[15px] text-sky-950 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <span>
                    {eventTitle(data.items) ? (
                      <>
                        Только заявки на событие{" "}
                        <span className="font-medium">«{eventTitle(data.items)}»</span>.
                      </>
                    ) : (
                      "Только заявки на выбранное событие."
                    )}{" "}
                    Количество в фильтрах — тоже по нему.
                  </span>
                </p>
                <Button asChild variant="outline" className="shrink-0">
                  <Link href={href({ event_id: null })}>Показать все заявки</Link>
                </Button>
              </div>
            ) : null}
            {/* фильтры — вместе с данными, чтобы количество в них было настоящим, а не «0» на время загрузки */}
            {all > 0 || status || type ? (
              <div className="mb-4 flex flex-col gap-2">
                <FilterChips label="Статус заявки" chips={statusChips} />
                <FilterChips label="Вид заявки" chips={typeChips} />
              </div>
            ) : null}
            {data.items.length ? (
              <>
                <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                  {data.items.map((app) => (
                    <Row key={app.id} app={app} />
                  ))}
                </ul>
                {data.total > PER_PAGE ? (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button asChild variant="outline" disabled={page <= 1}>
                      <Link href={href({ page: String(page - 1) })} aria-disabled={page <= 1}>
                        Назад
                      </Link>
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Страница {page} из {Math.ceil(data.total / PER_PAGE)}
                    </span>
                    <Button asChild variant="outline">
                      <Link
                        href={href({ page: String(page + 1) })}
                        aria-disabled={page * PER_PAGE >= data.total}
                      >
                        Дальше
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </>
            ) : status || type ? (
              <EmptyState icon={Inbox} title="Ничего не нашлось">
                Таких заявок нет. Попробуйте другой статус или вид.
              </EmptyState>
            ) : eventId ? (
              <EmptyState icon={Inbox} title="На это событие заявок нет">
                Когда кто-то запишется на сайте, заявка появится здесь, а вам придёт сообщение в
                Telegram.
              </EmptyState>
            ) : (
              <EmptyState icon={Inbox} title="Пока нет заявок">
                Когда кто-то оставит заявку на сайте — на опт, запись на событие или индивидуальную
                церемонию, — она появится здесь, а вам придёт сообщение в Telegram.
              </EmptyState>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}

export function ApplicationsList() {
  return (
    <>
      <PageHeader
        title="Заявки"
        description="Опт, записи на события и индивидуальные церемонии. Новые — сверху. Откройте заявку, чтобы связаться и поменять статус."
      />
      <RequirePermission permission="applications">
        <ListContent />
      </RequirePermission>
    </>
  );
}
