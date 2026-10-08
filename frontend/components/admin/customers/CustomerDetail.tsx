"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, Send } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { ORDER_STATUS_TONES, PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { NoAccess } from "@/components/admin/promotions/fields";
import { useAdmin } from "@/components/admin/session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { customerKeys, customerName, customersApi, type CustomerCard } from "@/lib/admin/customers";
import { formatDate, formatDateTime, formatPhone, formatRub, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_POINTS = 1_000_000;
const points = (n: number) => plural(n, "балл", "балла", "баллов");

function useUpdateCard(id: string) {
  const client = useQueryClient();
  return (next: CustomerCard) => {
    client.setQueryData(customerKeys.detail(id), next);
    void client.invalidateQueries({ queryKey: ["customers", "list"] });
  };
}

function PointsAdjust({ customer }: { customer: CustomerCard }) {
  const update = useUpdateCard(customer.id);
  const amountId = useId();
  const reasonId = useId();
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const n = /^\d+$/.test(amount) ? Number(amount) : 0;
  const balance = customer.points_balance;
  const tooMuch = mode === "remove" && n > balance;
  const amountError = amount && (n < 1 || n > MAX_POINTS) ? "Введите целое число больше нуля" : tooMuch ? `На счёте только ${balance} ${points(balance)}` : null;
  const ready = n >= 1 && n <= MAX_POINTS && !tooMuch && reason.trim().length > 0;
  const after = mode === "add" ? balance + n : balance - n;
  const verb = mode === "add" ? "Начислить" : "Списать";
  const reasonNote = "Обязательно. Напишите причину — покупатель увидит её в истории баллов в личном кабинете.";

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "add" | "remove")} className="grid-cols-2 gap-2" aria-label="Что сделать с баллами">
        <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[15px] font-normal">
          <RadioGroupItem value="add" aria-label="Начислить" />
          Начислить
        </Label>
        <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[15px] font-normal">
          <RadioGroupItem value="remove" aria-label="Списать" />
          Списать
        </Label>
      </RadioGroup>
      <Field id={amountId} label="Сколько баллов" error={amountError} hint="Целое число, 1 балл = 1 ₽. Например, 200 — подарок к празднику или компенсация.">
        <Input
          id={amountId}
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={describedBy(amountId, amountError)}
          className="max-w-40 tabular-nums"
        />
      </Field>
      <Field
        id={reasonId}
        label="Причина"
        required
        description={reasonNote}
        hint="Например: «Компенсация за задержку доставки» или «Подарок на день рождения»."
      >
        <Input
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          aria-describedby={describedBy(reasonId, null, reasonNote)}
        />
      </Field>
      <ConfirmAction
        trigger={n ? `${verb} ${n} ${points(n)}` : `${verb} баллы`}
        variant={mode === "add" ? "default" : "outline"}
        destructive={mode === "remove"}
        disabled={!ready}
        title={`${verb} ${n} ${points(n)}?`}
        description={
          <div className="flex flex-col gap-2">
            <p>
              Баланс клиента: <strong className="text-foreground tabular-nums">{`${balance} → ${after}`}</strong> {points(after)}.
            </p>
            <p>Причина: «{reason.trim()}». Покупатель увидит её в истории баллов.</p>
          </div>
        }
        confirm={mode === "add" ? "Да, начислить" : "Да, списать"}
        cancel="Не менять"
        onConfirm={async () => {
          const next = await customersApi.adjustPoints(customer.id, { delta: mode === "add" ? n : -n, comment: reason.trim() });
          update(next);
          toast.success(mode === "add" ? `Начислено ${n} ${points(n)}` : `Списано ${n} ${points(n)}`);
          setAmount("");
          setReason("");
        }}
      />
    </div>
  );
}

function Notes({ customer }: { customer: CustomerCard }) {
  const update = useUpdateCard(customer.id);
  const id = useId();
  const [text, setText] = useState(customer.notes ?? "");
  const [saved, setSaved] = useState(customer.notes ?? "");
  const changed = text.trim() !== saved.trim();
  const save = useMutation({
    mutationFn: () => customersApi.updateNotes(customer.id, text),
    onSuccess: (next) => {
      update(next);
      setSaved(next.notes ?? "");
      toast.success("Заметка сохранена");
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <Field
        id={id}
        label="Заметки о клиенте"
        hint="Видите только вы и сотрудники, покупатель — нет. Например: «любит шу, брал на ДР жены»."
        description={changed ? "Есть несохранённые изменения" : undefined}
      >
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          placeholder="Например: любит шу, брал на ДР жены"
          aria-describedby={changed ? `${id}-description` : undefined}
        />
      </Field>
      <Button type="button" variant="outline" className="self-start" onClick={() => save.mutate()} disabled={!changed || save.isPending}>
        {save.isPending ? "Сохраняем…" : "Сохранить заметку"}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function CustomerView({ customer: c }: { customer: CustomerCard }) {
  const link = "inline-flex min-h-11 items-center gap-2.5 underline-offset-4 hover:underline";
  return (
    <>
      <PageHeader
        back={{ href: "/admin/customers", label: "Все клиенты" }}
        title={<span className="[overflow-wrap:anywhere]">{customerName(c)}</span>}
        description={`Клиент с ${formatDate(c.created_at)}${c.marketing_consent ? " · согласен получать новости магазина" : ""}`}
      />

      {/* на телефоне — одна колонка: контакты, покупки, заметки, баллы, заказы */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Покупки" id="customer-stats" className="order-2 lg:order-none">
            <dl className="grid grid-cols-2 gap-2">
              <Stat label="Заказов" value={String(c.orders_count)} />
              <Stat label="Сумма покупок" value={formatRub(c.total_spent_kop)} />
              <Stat label="Средний чек" value={formatRub(c.average_check_kop)} />
              <Stat label="Последний заказ" value={c.last_order_at ? formatDate(c.last_order_at) : "—"} />
            </dl>
            <p className="mt-2 text-sm text-muted-foreground">Считаем оплаченные заказы, возвраты вычитаем.</p>
          </SectionCard>

          <SectionCard title="Баллы" id="customer-points" className="order-4 lg:order-none">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <p className="flex items-baseline gap-2">
                  <span data-testid="points-balance" className="text-3xl font-semibold tabular-nums">
                    {c.points_balance}
                  </span>
                  <span className="text-[15px]">{points(c.points_balance)} на счёте</span>
                </p>
                <p className="text-sm text-muted-foreground">1 балл = 1 ₽. Покупатель видит баланс и историю в личном кабинете.</p>
              </div>
              <PointsAdjust customer={c} />
              <div className="flex flex-col gap-2">
                <h3 className="font-medium">История</h3>
                {c.points_history.length ? (
                  <ul aria-label="История баллов" className="-mx-1 flex flex-col">
                    {c.points_history.map((h) => (
                      <li key={h.id} className="flex items-start justify-between gap-3 border-b px-1 py-2.5 last:border-b-0">
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span>{h.kind_label}</span>
                          {h.comment ? <span className="text-sm break-words">{h.comment}</span> : null}
                          <span className="text-sm text-muted-foreground">{formatDateTime(h.created_at)}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className={cn("font-semibold tabular-nums", h.delta > 0 ? "text-emerald-700" : "text-red-700")}>
                            {h.delta > 0 ? `+${h.delta}` : `−${Math.abs(h.delta)}`}
                          </span>
                          <span className="text-sm text-muted-foreground tabular-nums">остаток {h.balance_after}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-muted-foreground">Операций с баллами пока не было.</p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Заказы" id="customer-orders" className="order-5 lg:order-none">
            {c.orders.length ? (
              <ul className="-mx-4 -mb-4 flex flex-col overflow-hidden rounded-b-xl border-t md:-mx-5 md:-mb-5">
                {c.orders.map((o) => (
                  <li key={o.id} className="border-b last:border-b-0">
                    <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-muted md:px-5">
                      <span className="flex flex-col">
                        <span className="font-mono text-[15px] font-medium">{o.number}</span>
                        <span className="text-sm text-muted-foreground">{formatDate(o.created_at)}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <StatusBadge tone={ORDER_STATUS_TONES[o.status]}>{o.status_label}</StatusBadge>
                        <span className="w-24 text-right font-medium tabular-nums">{formatRub(o.total_kop)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">Заказов пока нет.</p>
            )}
          </SectionCard>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Контакты" id="customer-contacts" className="order-1 lg:order-none">
            {c.phone || c.email || c.telegram_username ? (
              <ul className="flex flex-col text-[15px]">
                {c.phone ? (
                  <li>
                    <a href={`tel:${c.phone}`} className={link}>
                      <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                      {formatPhone(c.phone)}
                    </a>
                  </li>
                ) : null}
                {c.email ? (
                  <li>
                    <a href={`mailto:${c.email}`} className={cn(link, "break-all")}>
                      <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {c.email}
                    </a>
                  </li>
                ) : null}
                {c.telegram_username ? (
                  <li>
                    <a href={`https://t.me/${c.telegram_username}`} target="_blank" rel="noopener noreferrer" className={link}>
                      <Send className="size-4 text-muted-foreground" aria-hidden="true" />@{c.telegram_username}
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">Контактов нет.</p>
            )}
          </SectionCard>

          <SectionCard title="Заметки" id="customer-notes" className="order-3 lg:order-none">
            <Notes customer={c} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Card({ id }: { id: string }) {
  const query = useQuery({ queryKey: customerKeys.detail(id), queryFn: () => customersApi.get(id) });
  return <QueryState query={query}>{(customer) => <CustomerView customer={customer} />}</QueryState>;
}

/** Карточка клиента (/admin/customers/{id}). */
export function CustomerDetail({ id }: { id: string }) {
  const { can } = useAdmin();
  if (!can("customers")) return <NoAccess section="Клиенты" />;
  return <Card id={id} />;
}
