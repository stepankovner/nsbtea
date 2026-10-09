"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarDays, History, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

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

function ArchivedRow({ event }: { event: AdminEvent }) {
  const client = useQueryClient();
  const restore = useMutation({
    mutationFn: () => eventsApi.restore(event.id),
    onSuccess: (next) => {
      void client.invalidateQueries({ queryKey: contentKeys.events });
      client.setQueryData(contentKeys.event(next.id), next);
      toast.success(
        "Событие возвращено. Оно скрыто с сайта — откройте его и нажмите «Показать на сайте»",
      );
    },
  });
  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{event.title}</span>
        <span className="text-[15px]">
          <span className="text-muted-foreground">{event.type_label}</span> ·{" "}
          {eventWhen(event.starts_at, true)}
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        aria-label={`Восстановить «${event.title}»`}
        disabled={restore.isPending}
        onClick={() => restore.mutate()}
      >
        Восстановить
      </Button>
    </li>
  );
}

const PERIODS: EventPeriod[] = ["upcoming", "past", "archived"];

function EventsContent() {
  const pathname = usePathname();
  const params = useSearchParams();
  const asked = params.get("period") as EventPeriod | null;
  const period: EventPeriod = asked && PERIODS.includes(asked) ? asked : "upcoming";
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
          { key: "upcoming", label: "Ближайшие", href: pathname, active: period === "upcoming" },
          {
            key: "past",
            label: "Прошедшие",
            href: `${pathname}?period=past`,
            active: period === "past",
          },
          {
            key: "archived",
            label: "Архив",
            href: `${pathname}?period=archived`,
            active: period === "archived",
          },
        ]}
      />
      {period === "past" ? (
        <p className="mb-3 text-[15px] text-muted-foreground">
          Сюда события попадают сами, когда проходит их дата. На сайте они видны в разделе
          «Прошедшие события». Чтобы повторить событие, откройте его и нажмите «Создать копию».
        </p>
      ) : null}
      {period === "archived" ? (
        <p className="mb-3 text-[15px] text-muted-foreground">
          События, которые вы убрали в архив. На сайте их нет. Восстановленное событие вернётся
          скрытым с сайта — откройте его и нажмите «Показать на сайте», когда будете готовы.
        </p>
      ) : null}
      <QueryState query={list}>
        {(events) => {
          if (period === "archived") {
            return events.length ? (
              <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                {events.map((e) => (
                  <ArchivedRow key={e.id} event={e} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={Archive} title="В архиве пусто">
                Сюда попадают события, которые вы убрали в архив. Их можно вернуть в любой момент.
              </EmptyState>
            );
          }
          if (events.length) {
            return (
              <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} past={period === "past"} />
                ))}
              </ul>
            );
          }
          return period === "past" ? (
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
          );
        }}
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
