"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, Phone, Send } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { RequirePermission } from "@/components/admin/content/shared";
import { Field } from "@/components/admin/Field";
import { PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/errors";
import {
  APPLICATION_STATUS_TONES,
  APPLICATION_STATUSES,
  applicationDetails,
  applicationKeys,
  applicationsApi,
  contactLinks,
  type Application,
  type ApplicationStatus,
} from "@/lib/admin/applications";
import { formatDateTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONTACT_ICONS = { phone: Phone, telegram: Send, email: Mail } as const;

function ApplicationView({ app }: { app: Application }) {
  const client = useQueryClient();
  const commentId = useId();
  const [comment, setComment] = useState(app.admin_comment ?? "");
  // выбранный статус показываем сразу, не дожидаясь ответа сервера
  const [choosing, setChoosing] = useState<ApplicationStatus | null>(null);

  const apply = (next: Application) => {
    client.setQueryData(applicationKeys.detail(app.id), next);
    void client.invalidateQueries({ queryKey: [...applicationKeys.all, "list"] });
    void client.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: ApplicationStatus) => applicationsApi.patch(app.id, { status }),
    onSuccess: (next) => {
      apply(next);
      toast.success(`Статус: ${next.status_label}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setChoosing(null),
  });
  const saveComment = useMutation({
    mutationFn: () => applicationsApi.patch(app.id, { admin_comment: comment.trim() }),
    onSuccess: (next) => {
      apply(next);
      toast.success("Комментарий сохранён");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const current = choosing ?? app.status;
  const contacts = contactLinks(app);
  const details = applicationDetails(app);
  const commentDirty = comment.trim() !== (app.admin_comment ?? "").trim();

  function choose(status: ApplicationStatus) {
    if (status === current || setStatus.isPending) return;
    setChoosing(status);
    setStatus.mutate(status);
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/applications", label: "Все заявки" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Заявка от {app.name}
            <StatusBadge tone={APPLICATION_STATUS_TONES[app.status]}>
              {app.status_label}
            </StatusBadge>
          </span>
        }
        description={`${app.type_label} · ${formatDateTime(app.created_at)}`}
      />

      <div role="group" aria-label="Статус заявки" className="mb-5 grid gap-2 sm:grid-cols-3">
        {APPLICATION_STATUSES.map((s) => {
          const active = current === s.value;
          return (
            <Button
              key={s.value}
              type="button"
              size="lg"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => choose(s.value)}
              className="h-auto min-h-14 flex-col items-start gap-0.5 whitespace-normal py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-base">
                {active ? <Check className="size-4" aria-hidden="true" /> : null}
                {s.label}
              </span>
              <span
                className={cn(
                  "text-sm font-normal",
                  active ? "opacity-80" : "text-muted-foreground",
                )}
              >
                {s.hint}
              </span>
            </Button>
          );
        })}
      </div>
      {app.status === "cancelled" ? (
        <p className="-mt-2 mb-5 text-[15px] text-muted-foreground">
          Запись отменена, места освобождены. Чтобы вернуть заявку в работу, выберите статус выше.
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          <SectionCard title="Как связаться" id="app-contacts">
            <div className="flex flex-col gap-2">
              <span className="text-[17px] font-medium">{app.name}</span>
              {contacts.length ? (
                <ul className="flex flex-col gap-1">
                  {contacts.map((c) => {
                    const Icon = CONTACT_ICONS[c.kind];
                    return (
                      <li key={c.href}>
                        <a
                          href={c.href}
                          target={c.kind === "telegram" ? "_blank" : undefined}
                          rel={c.kind === "telegram" ? "noopener noreferrer" : undefined}
                          className="flex min-h-11 items-center gap-3 text-[16px] underline underline-offset-2"
                        >
                          <Icon
                            className="size-5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {c.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[15px] text-muted-foreground">Контактов нет.</p>
              )}
              <p className="text-sm text-muted-foreground">
                Нажмите на телефон, чтобы позвонить, или на ник — чтобы написать в Telegram.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Что хочет" id="app-details">
            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
              {app.type === "event" && app.event_title ? (
                <>
                  <dt className="text-muted-foreground">Событие</dt>
                  <dd>
                    {app.event_id ? (
                      <Link
                        href={`/admin/content/events/${app.event_id}`}
                        className="underline underline-offset-2"
                      >
                        {app.event_title}
                      </Link>
                    ) : (
                      app.event_title
                    )}
                  </dd>
                </>
              ) : null}
              {details.map((d) => (
                <div key={d.key} className="contents">
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="whitespace-pre-line break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
            {!details.length && !(app.type === "event" && app.event_title) ? (
              <p className="text-[15px] text-muted-foreground">
                Человек ничего не уточнил — спросите при звонке.
              </p>
            ) : null}
            {app.type === "event" && app.status !== "cancelled" ? (
              <div className="mt-4 border-t pt-4">
                <ConfirmAction
                  trigger="Отменить запись"
                  title="Отменить запись на событие?"
                  description={`${app.guests} ${plural(app.guests, "место освободится", "места освободятся", "мест освободятся")} — их снова можно будет занять на сайте. Человеку ничего не придёт: предупредите его сами.`}
                  confirm="Да, отменить запись"
                  cancel="Не отменять"
                  onConfirm={async () => {
                    const next = await applicationsApi.patch(app.id, { status: "cancelled" });
                    apply(next);
                    toast.success("Запись отменена, места освободились");
                  }}
                />
              </div>
            ) : null}
          </SectionCard>
        </div>

        <SectionCard title="Комментарий сотрудника" id="app-comment">
          <div className="flex flex-col gap-3">
            <Field
              id={commentId}
              label="Комментарий для себя"
              hint="Человек его не увидит. Например: «Отправил прайс 12.10, перезвонить в пятницу»."
            >
              <Textarea
                id={commentId}
                value={comment}
                maxLength={5000}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-28"
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={!commentDirty || saveComment.isPending}
              onClick={() => saveComment.mutate()}
            >
              Сохранить комментарий
            </Button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function DetailLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: () => applicationsApi.get(id),
  });
  return (
    <QueryState query={query}>{(app) => <ApplicationView key={app.id} app={app} />}</QueryState>
  );
}

export function ApplicationDetail({ id }: { id: string }) {
  return (
    <RequirePermission permission="applications">
      <DetailLoader id={id} />
    </RequirePermission>
  );
}
