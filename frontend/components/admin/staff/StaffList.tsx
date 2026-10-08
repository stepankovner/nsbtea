"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { OwnerOnly } from "@/components/admin/settings/OwnerOnly";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import {
  addDays,
  DEFAULT_ACCESS_DAYS,
  DEFAULT_PERMISSIONS,
  endOfMoscowDay,
  INVITE_DAYS,
  moscowDateInput,
  permissionLabel,
  permissionsText,
  STAFF_STATUS,
  staffApi,
  staffKeys,
  staffStatus,
  type PermissionOption,
  type Staff,
  type StaffStatus,
} from "@/lib/admin/staff";
import { formatDate, formatDateTime } from "@/lib/format";

import { ShareLink } from "./ShareLink";

type Errors = Record<string, string>;

const DIALOG_CLASS = "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg";

function errorsOf(e: unknown): { byField: Errors; general: string | null } {
  const byField = e instanceof ApiError ? fieldErrors(e) : {};
  const known = ["name", "email", "permissions", "expires_at"];
  return { byField, general: Object.keys(byField).some((k) => known.includes(k)) ? null : errorMessage(e) };
}

function ordered(selected: string[], options: PermissionOption[]): string[] {
  const set = new Set(selected);
  return options.map((o) => o.value).filter((v) => set.has(v));
}

// ------------------------------------------------------------------ поля

function PermissionPicker({
  options,
  value,
  onChange,
  error,
}: {
  options: PermissionOption[];
  value: string[];
  onChange: (next: string[]) => void;
  error?: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[15px] font-medium">Какие разделы открыть</legend>
      <p className="text-sm text-muted-foreground">
        Настройки, деньги (выручка и возвраты), сотрудники и журнал действий есть только у вас — сотруднику их дать нельзя.
      </p>
      <div className="grid gap-1 sm:grid-cols-2">
        {options.map((o) => {
          const label = permissionLabel(o.value, options);
          const checked = value.includes(o.value);
          return (
            <Label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-[15px] font-normal hover:bg-muted">
              <Checkbox
                checked={checked}
                aria-label={label}
                onCheckedChange={(next) => onChange(next === true ? [...value, o.value] : value.filter((v) => v !== o.value))}
              />
              {label}
            </Label>
          );
        })}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

function AccessDateField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const id = useId();
  return (
    <Field
      id={id}
      label="Доступ до"
      hint="Последний день доступа, включительно. После него сотрудник не сможет войти — доступ отключится сам. Продлить можно в любой момент. Например: 31 декабря."
      error={error}
      className="sm:max-w-xs"
    >
      <Input
        id={id}
        type="date"
        min={moscowDateInput()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error)}
      />
    </Field>
  );
}

function InviteLinkView({ url, name, renewed }: { url: string; name: string; renewed?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <ShareLink
        url={url}
        label="Ссылка-приглашение"
        shareTitle="Приглашение в админку «НСБ Чай»"
        shareText={`${name}, это приглашение в админку магазина «НСБ Чай». Откройте ссылку, придумайте пароль — и можно работать.`}
      />
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">
        <li>Отправьте ссылку сотруднику — в Telegram, WhatsApp или СМС.</li>
        <li>Он откроет её, придумает пароль и сразу войдёт в админку.</li>
        <li>Дальше он входит со своей почтой и паролем на странице входа.</li>
      </ol>
      <p className="text-sm text-muted-foreground">
        {renewed ? "Старая ссылка больше не работает. " : ""}Ссылка действует {INVITE_DAYS} дней. Если сотрудник не успеет — нажмите
        «Новая ссылка-приглашение» в его карточке.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ окна

function InviteDialog({ options, onClose }: { options: PermissionOption[]; onClose: () => void }) {
  const client = useQueryClient();
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [date, setDate] = useState(() => addDays(moscowDateInput(), DEFAULT_ACCESS_DAYS));
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Parameters<typeof staffApi.create>[0]) => staffApi.create(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: staffKeys.all });
      toast.success("Приглашение создано");
    },
    onError: (e) => {
      const { byField, general: g } = errorsOf(e);
      setErrors(byField);
      setGeneral(g);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = "Введите имя";
    if (!email.trim()) next.email = "Введите почту";
    if (!permissions.length) next.permissions = "Отметьте хотя бы один раздел";
    if (!date) next.expires_at = "Укажите, до какого числа нужен доступ";
    setErrors(next);
    setGeneral(null);
    if (Object.keys(next).length) return;
    create.mutate({ name: name.trim(), email: email.trim(), permissions: ordered(permissions, options), expires_at: endOfMoscowDay(date) });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        {create.data ? (
          <>
            <DialogHeader>
              <DialogTitle>Приглашение готово</DialogTitle>
              <DialogDescription>
                Для сотрудника «{create.data.staff.name}» ({create.data.staff.email}).
              </DialogDescription>
            </DialogHeader>
            <InviteLinkView url={create.data.invite_url} name={create.data.staff.name} />
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Готово
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Пригласить сотрудника</DialogTitle>
              <DialogDescription>
                Отметьте разделы и срок. Вы получите ссылку-приглашение — отправьте её сотруднику.
              </DialogDescription>
            </DialogHeader>
            <Field id={nameId} label="Имя" hint="Как вы его зовёте — так он будет подписан в списке и в журнале действий. Например: Аня." error={errors.name}>
              <Input
                id={nameId}
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={describedBy(nameId, errors.name)}
              />
            </Field>
            <Field id={emailId} label="Почта" hint="С этой почтой сотрудник будет входить в админку. Например: anya@mail.ru." error={errors.email}>
              <Input
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={describedBy(emailId, errors.email)}
              />
            </Field>
            <PermissionPicker options={options} value={permissions} onChange={setPermissions} error={errors.permissions} />
            <AccessDateField value={date} onChange={setDate} error={errors.expires_at} />
            {general ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {general}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Создаём…" : "Создать приглашение"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function initialDate(s: Staff, restore: boolean): string {
  const today = moscowDateInput();
  if (s.expires_at && new Date(s.expires_at).getTime() > Date.now()) return moscowDateInput(s.expires_at);
  if (s.expires_at || restore) return addDays(today, DEFAULT_ACCESS_DAYS);
  return "";
}

function AccessDialog({ staff, options, restore, onClose }: { staff: Staff; options: PermissionOption[]; restore: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [permissions, setPermissions] = useState<string[]>(staff.permissions);
  const [date, setDate] = useState(() => initialDate(staff, restore));
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      staffApi.update(staff.id, {
        permissions: ordered(permissions, options),
        ...(date ? { expires_at: endOfMoscowDay(date) } : {}),
        ...(restore ? { restore: true } : {}),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: staffKeys.all });
      toast.success(restore ? "Доступ возвращён" : "Доступ изменён");
      onClose();
    },
    onError: (e) => {
      const { byField, general: g } = errorsOf(e);
      setErrors(byField);
      setGeneral(g);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!permissions.length) next.permissions = "Отметьте хотя бы один раздел";
    if (!date && staff.expires_at) next.expires_at = "Укажите, до какого числа нужен доступ";
    setErrors(next);
    setGeneral(null);
    if (!Object.keys(next).length) update.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{restore ? `Вернуть доступ: ${staff.name}` : `Доступ: ${staff.name}`}</DialogTitle>
            <DialogDescription>
              {restore
                ? "Сотрудник снова сможет входить в админку. Проверьте разделы и срок."
                : "Изменения подействуют сразу — сотруднику не нужно заново входить."}
            </DialogDescription>
          </DialogHeader>
          <PermissionPicker options={options} value={permissions} onChange={setPermissions} error={errors.permissions} />
          <AccessDateField value={date} onChange={setDate} error={errors.expires_at} />
          {general ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {general}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {restore ? "Вернуть доступ" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenewedDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG_CLASS} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Новая ссылка для «{name}»</DialogTitle>
          <DialogDescription>Отправьте её сотруднику вместо прежней.</DialogDescription>
        </DialogHeader>
        <InviteLinkView url={url} name={name} renewed />
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ список

const STATUS_ORDER: StaffStatus[] = ["active", "invited", "expired", "revoked"];

function StaffCard({
  staff,
  options,
  onEdit,
  onRenewed,
}: {
  staff: Staff;
  options: PermissionOption[];
  onEdit: (staff: Staff, restore: boolean) => void;
  onRenewed: (url: string, staff: Staff) => void;
}) {
  const client = useQueryClient();
  const id = useId();
  const status = staffStatus(staff);
  const view = STAFF_STATUS[status];
  const renew = useMutation({
    mutationFn: () => staffApi.renewInvite(staff.id),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: staffKeys.all });
      onRenewed(data.invite_url, data.staff);
    },
  });

  return (
    <article aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="text-[17px] font-semibold">
            {staff.name}
          </h2>
          <span className="text-sm break-all text-muted-foreground">{staff.email}</span>
        </div>
        <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-[15px] sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Разделы</dt>
        <dd>{staff.permissions.length ? permissionsText(staff.permissions, options) : "не выбраны"}</dd>
        <dt className="text-muted-foreground">Срок доступа</dt>
        <dd>
          {staff.expires_at ? (status === "expired" ? `закончился ${formatDate(staff.expires_at)}` : `до ${formatDate(staff.expires_at)}`) : "без срока"}
        </dd>
        <dt className="text-muted-foreground">Последний вход</dt>
        <dd>{staff.last_login_at ? formatDateTime(staff.last_login_at) : "входа ещё не было"}</dd>
      </dl>

      {status === "invited" ? (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Ещё не принял приглашение. Если ссылка потерялась или прошло больше {INVITE_DAYS} дней — выдайте новую.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "revoked" ? (
          <Button type="button" onClick={() => onEdit(staff, true)}>
            Вернуть доступ
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => onEdit(staff, false)}>
              Изменить доступ
            </Button>
            {staff.invite_pending ? (
              <Button type="button" variant="outline" onClick={() => renew.mutate()} disabled={renew.isPending}>
                Новая ссылка-приглашение
              </Button>
            ) : null}
            <ConfirmAction
              trigger="Отозвать доступ"
              title={`Отозвать доступ: ${staff.name}?`}
              description="Сотрудник сразу выйдет со всех устройств и больше не сможет войти. Вернуть доступ можно в любой момент кнопкой «Вернуть доступ»."
              confirm="Да, отозвать"
              cancel="Не отзывать"
              onConfirm={async () => {
                await staffApi.revoke(staff.id);
                await client.invalidateQueries({ queryKey: staffKeys.all });
                toast.success(`Доступ отозван: ${staff.name}`);
              }}
            />
          </>
        )}
        <Button asChild variant="ghost">
          <Link href={`/admin/audit?actor=${staff.id}`}>
            <History aria-hidden="true" />
            Действия в журнале
          </Link>
        </Button>
      </div>
    </article>
  );
}

function StaffScreen() {
  const list = useQuery({ queryKey: staffKeys.list, queryFn: staffApi.list });
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<{ staff: Staff; restore: boolean } | null>(null);
  const [renewed, setRenewed] = useState<{ url: string; name: string } | null>(null);
  const options = list.data?.permissions ?? [];

  return (
    <>
      <PageHeader
        title="Сотрудники"
        description="Временный доступ для помощника: вы выбираете разделы и срок, сотрудник входит по ссылке-приглашению. Отозвать доступ можно в один клик."
        actions={
          <Button size="lg" className="w-full sm:w-auto" onClick={() => setInviting(true)}>
            <UserPlus aria-hidden="true" />
            Пригласить сотрудника
          </Button>
        }
      />
      <QueryState query={list}>
        {(data) => {
          const people = data.items
            .filter((s) => !s.is_owner)
            .sort((a, b) => STATUS_ORDER.indexOf(staffStatus(a)) - STATUS_ORDER.indexOf(staffStatus(b)));
          return people.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {people.map((s) => (
                <StaffCard
                  key={s.id}
                  staff={s}
                  options={data.permissions}
                  onEdit={(staff, restore) => setEditing({ staff, restore })}
                  onRenewed={(url, staff) => setRenewed({ url, name: staff.name })}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title="Пока нет сотрудников">
              Если нужен помощник — нажмите «Пригласить сотрудника», отметьте разделы (например, «Заказы» и «Склад») и срок. Он войдёт по
              ссылке и увидит только эти разделы.
            </EmptyState>
          );
        }}
      </QueryState>

      {inviting && list.data ? <InviteDialog options={options} onClose={() => setInviting(false)} /> : null}
      {editing ? <AccessDialog staff={editing.staff} restore={editing.restore} options={options} onClose={() => setEditing(null)} /> : null}
      {renewed ? <RenewedDialog url={renewed.url} name={renewed.name} onClose={() => setRenewed(null)} /> : null}
    </>
  );
}

export function StaffPage() {
  return (
    <OwnerOnly>
      <StaffScreen />
    </OwnerOnly>
  );
}
