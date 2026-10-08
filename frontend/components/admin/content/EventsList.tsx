"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, History, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import {
  contentKeys,
  eventsApi,
  eventWhen,
  seatsSummary,
  type AdminEvent,
  type EventPeriod,
} from "@/lib/admin/content";
import { cn } from "@/lib/utils";

import { FilterChips, RequirePermission } from "./shared";

function EventRow({ event, past }: { event: AdminEvent; past: boolean }) {
  const seats = seatsSummary(event);
  return (
    <li className="border-b last:border-b-0">
      <Link
        href={`/admin/content/events/${event.id}`}
        className={cn(
          "flex flex-col gap-1.5 px-4 py-3.5 hover:bg-muted md:flex-row md:items-center md:gap-4",
          !event.is_published && "bg-muted/40",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{event.title}</span>
          <span className="text-[15px]">
            <span className="text-muted-foreground">{event.type_label}</span> ·{" "}
            {eventWhen(event.starts_at, past)}
          </span>
          {event.place ? (
            <span className="truncate text-sm text-muted-foreground">{event.place}</span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2 md:justify-end">
          {seats ? <span className="text-sm text-muted-foreground">{seats}</span> : null}
          {event.seats_left === 0 && !past ? (
            <StatusBadge tone="warning">Мест нет</StatusBadge>
          ) : null}
          {event.is_published ? (
            <StatusBadge tone="success">На сайте</StatusBadge>
          ) : (
            <StatusBadge>Скрыто</StatusBadge>
          )}
        </span>
      </Link>
    </li>
  );
}

function EventsContent() {
  const pathname = usePathname();
  const params = useSearchParams();
  const period: EventPeriod = params.get("period") === "past" ? "past" : "upcoming";
  const past = period === "past";
  const list = useQuery({
    queryKey: contentKeys.eventList(period),
    queryFn: () => eventsApi.list(period),
  });

  return (
    <>
      <FilterChips
        label="Какие события показать"
        className="mb-4"
        chips={[
          { key: "upcoming", label: "Ближайшие", href: pathname, active: !past },
          {
            key: "past",
            label: "Прошедшие (архив)",
            href: `${pathname}?period=past`,
            active: past,
          },
        ]}
      />
      {past ? (
        <p className="mb-3 text-[15px] text-muted-foreground">
          Сюда события попадают сами, когда проходит их дата. На сайте они видны в разделе
          «Прошедшие события». Чтобы повторить событие, откройте его и нажмите «Создать копию».
        </p>
      ) : null}
      <QueryState query={list}>
        {(events) =>
          events.length ? (
            <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {events.map((e) => (
                <EventRow key={e.id} event={e} past={past} />
              ))}
            </ul>
          ) : past ? (
            <EmptyState icon={History} title="Прошедших событий пока нет">
              Когда дата события пройдёт, оно само переедет сюда.
            </EmptyState>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Ближайших событий нет"
              action={
                <Button asChild>
                  <Link href="/admin/content/events/new">Добавить событие</Link>
                </Button>
              }
            >
              Добавьте церемонию, сплав или лекцию — событие появится в расписании на сайте и на
              главной, а записи придут в «Заявки».
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}

export function EventsList() {
  const { can } = useAdmin();
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content", label: "Сайт" }}
        title="События"
        description="Церемонии, сплавы и лекции. Время везде — по Москве."
        actions={
          can("content") ? (
            <Button asChild size="lg">
              <Link href="/admin/content/events/new">
                <Plus aria-hidden="true" />
                Новое событие
              </Link>
            </Button>
          ) : null
        }
      />
      <RequirePermission permission="content">
        <EventsContent />
      </RequirePermission>
    </>
  );
}
