"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, ExternalLink, Pencil, Send } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { OwnerOnly } from "@/components/admin/settings/OwnerOnly";
import { ShareLink } from "@/components/admin/staff/ShareLink";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/errors";
import type { Schemas } from "@/lib/api/client";
import { EVENT_DETAILS, notificationKeys, notificationsApi, type NotificationsData, type Recipient } from "@/lib/admin/notifications";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type EventOption = Schemas["EventOption"];

const DIALOG_CLASS = "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg";

/** «12:30» по Москве — код живёт 30 минут, дата не нужна. */
function moscowTime(iso: string): string {
  return formatDateTime(iso).split(", ").pop() ?? "";
}

function useRecipientUpdate(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Schemas["RecipientPatch"]) => notificationsApi.update(id, patch),
    onSuccess: (next) => {
      client.setQueryData<NotificationsData>(notificationKeys.all, (old) =>
        old ? { ...old, recipients: old.recipients.map((r) => (r.id === next.id ? next : r)) } : old,
      );
      toast.success("Сохранено");
    },
  });
}

function RenameDialog({ recipient, onClose }: { recipient: Recipient; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState(recipient.name);
  const [error, setError] = useState<string | null>(null);
  const update = useRecipientUpdate(recipient.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    update.mutate({ name: name.trim() }, { onSuccess: onClose, onError: (e) => setError(errorMessage(e)) });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Переименовать получателя</DialogTitle>
            <DialogDescription>Название видите только вы — чтобы не путать чаты.</DialogDescription>
          </DialogHeader>
          <Field id={id} label="Название" hint="Например: Аня (помощник) или Мой второй телефон." error={error}>
            <Input
              id={id}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy(id, error)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={update.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecipientCard({ recipient, events, onRename }: { recipient: Recipient; events: EventOption[]; onRename: (r: Recipient) => void }) {
  const client = useQueryClient();
  const id = useId();
  const update = useRecipientUpdate(recipient.id);
  // пока сохраняется — показываем уже новое состояние
  const pending = update.isPending ? update.variables : undefined;
  const chosen = pending?.events ?? recipient.events;
  const active = pending?.is_active ?? recipient.is_active;

  function toggle(value: string, on: boolean) {
    const set = new Set(chosen);
    if (on) set.add(value);
    else set.delete(value);
    update.mutate({ events: events.map((e) => e.value).filter((v) => set.has(v)) });
  }

  return (
    <article aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={id} className="text-[17px] font-semibold break-words">
          {recipient.name}
        </h2>
        {active ? <StatusBadge tone="success">Получает</StatusBadge> : <StatusBadge tone="neutral">На паузе</StatusBadge>}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3">
        <Label htmlFor={`${id}-active`} className="min-h-12 flex-1 text-[15px] font-normal">
          Присылать уведомления
        </Label>
        <Switch
          id={`${id}-active`}
          checked={active}
          disabled={update.isPending}
          onCheckedChange={(on) => update.mutate({ is_active: on })}
          className="scale-125"
        />
      </div>

      <fieldset className={cn("flex flex-col gap-1", !active && "opacity-60")}>
        <legend className="mb-1 text-[15px] font-medium">Какие уведомления</legend>
        {events.map((e) => (
          <Label key={e.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-2 font-normal hover:bg-muted">
            <Checkbox
              className="mt-0.5"
              aria-label={e.label}
              checked={chosen.includes(e.value)}
              disabled={update.isPending}
              onCheckedChange={(on) => toggle(e.value, on === true)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px]">{e.label}</span>
              {EVENT_DETAILS[e.value] ? <span className="text-sm text-muted-foreground">{EVENT_DETAILS[e.value]}</span> : null}
            </span>
          </Label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onRename(recipient)}>
          <Pencil aria-hidden="true" />
          Переименовать
        </Button>
        <ConfirmAction
          trigger="Удалить"
          title={`Удалить получателя «${recipient.name}»?`}
          description="Этот чат перестанет получать уведомления от бота магазина. Чтобы вернуть, добавьте его снова — по новому коду. Если нужно лишь на время, лучше выключите «Присылать уведомления»."
          confirm="Да, удалить"
          cancel="Не удалять"
          onConfirm={async () => {
            await notificationsApi.remove(recipient.id);
            client.setQueryData<NotificationsData>(notificationKeys.all, (old) =>
              old ? { ...old, recipients: old.recipients.filter((r) => r.id !== recipient.id) } : old,
            );
            toast.success("Получатель удалён");
          }}
        />
      </div>
    </article>
  );
}

function AddRecipientDialog({
  link,
  bot,
  added,
  checking,
  onRetry,
  onCheck,
  onClose,
}: {
  link: { data?: Schemas["LinkOut"]; isPending: boolean; error: unknown };
  bot: string | null;
  added: Recipient[];
  checking: boolean;
  onRetry: () => void;
  onCheck: () => void;
  onClose: () => void;
}) {
  const botName = bot ? `@${bot}` : "ботом магазина";
  const data = link.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Добавить получателя</DialogTitle>
          <DialogDescription>
            Так уведомления будут приходить ещё в один Telegram — например, помощнику или на ваш второй телефон.
          </DialogDescription>
        </DialogHeader>

        {added.length ? (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[15px] text-emerald-900">
            Готово: {added.map((r) => `«${r.name}»`).join(", ")} {added.length > 1 ? "добавлены" : "добавлен"} в получатели. Закройте окно и
            отметьте, какие уведомления присылать — сейчас включены все.
          </p>
        ) : null}

        {link.isPending ? <p className="text-muted-foreground">Получаем код…</p> : null}
        {link.error ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage(link.error)}
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Попробовать ещё раз
            </Button>
          </div>
        ) : null}

        {data ? (
          <div className="flex flex-col gap-4">
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-[15px] leading-relaxed">
              <li>
                Откройте ссылку на телефоне, где установлен Telegram того, кто будет получать уведомления.
                <Button asChild size="lg" className="mt-2 flex w-full sm:w-auto">
                  <a href={data.deep_link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden="true" />
                    Открыть Telegram
                  </a>
                </Button>
              </li>
              <li>Откроется чат с {botName}. Нажмите внизу кнопку «Запустить» (или Start).</li>
              <li>Бот ответит: «Готово! Этот чат добавлен в получатели уведомлений».</li>
              <li>Вернитесь сюда и нажмите «Проверить» — новый получатель появится в списке.</li>
            </ol>
            <p className="rounded-lg border bg-background px-3 py-2 text-sm">
              Ссылка не открывается? Найдите в Telegram {botName} и отправьте ему сообщение{" "}
              <b className="font-mono text-base whitespace-nowrap">/start {data.code}</b>
            </p>
            <ShareLink
              url={data.deep_link}
              label="Уведомления нужны другому человеку? Отправьте ему ссылку"
              shareTitle="Уведомления магазина «НСБ Чай»"
              shareText="Откройте ссылку в Telegram и нажмите «Запустить» — бот магазина «НСБ Чай» начнёт присылать уведомления."
            />
            <p className="text-sm text-muted-foreground">
              Код действует до {moscowTime(data.expires_at)} (30 минут). Бот пишет только в личный чат — в группы уведомления не приходят.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
          {data ? (
            <Button type="button" onClick={onCheck} disabled={checking}>
              {checking ? "Проверяем…" : "Проверить"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotificationsScreen() {
  const [adding, setAdding] = useState<string[] | null>(null);
  const [renaming, setRenaming] = useState<Recipient | null>(null);
  const list = useQuery({
    queryKey: notificationKeys.all,
    queryFn: notificationsApi.list,
    // пока открыто окно добавления — сами проверяем, не появился ли новый чат
    refetchInterval: adding ? 5_000 : false,
  });
  const link = useMutation({ mutationFn: () => notificationsApi.link() });

  function startAdding() {
    setAdding((list.data?.recipients ?? []).map((r) => r.id));
    link.mutate();
  }

  const added = adding ? (list.data?.recipients ?? []).filter((r) => !adding.includes(r.id)) : [];

  return (
    <>
      <PageHeader
        title="Уведомления в Telegram"
        description="Бот магазина присылает сообщения о новых заказах, заявках и остатках. Здесь — кто их получает и какие именно."
        actions={
          <Button size="lg" className="w-full sm:w-auto" onClick={startAdding}>
            <Send aria-hidden="true" />
            Добавить получателя
          </Button>
        }
      />
      <QueryState query={list}>
        {(data) =>
          data.recipients.length ? (
            <>
              <p className="mb-4 max-w-2xl text-[15px] text-muted-foreground">
                Изменения сохраняются сразу. Вы становитесь получателем сами, когда подключаете Telegram в своём профиле.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {data.recipients.map((r) => (
                  <RecipientCard key={r.id} recipient={r} events={data.events} onRename={setRenaming} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={BellOff}
              title="Пока никто не получает уведомления"
              action={
                <Button asChild variant="outline">
                  <Link href="/admin/profile">Мой профиль</Link>
                </Button>
              }
            >
              Подключите свой Telegram в разделе «Мой профиль» — вы сразу станете получателем. Чтобы уведомления получал кто-то ещё, нажмите
              «Добавить получателя».
            </EmptyState>
          )
        }
      </QueryState>

      {adding ? (
        <AddRecipientDialog
          link={link}
          bot={list.data?.bot_username ?? null}
          added={added}
          checking={list.isFetching}
          onRetry={() => link.mutate()}
          onCheck={() => void list.refetch()}
          onClose={() => {
            setAdding(null);
            link.reset();
          }}
        />
      ) : null}
      {renaming ? <RenameDialog recipient={renaming} onClose={() => setRenaming(null)} /> : null}
    </>
  );
}

export function NotificationsPage() {
  return (
    <OwnerOnly>
      <NotificationsScreen />
    </OwnerOnly>
  );
}
