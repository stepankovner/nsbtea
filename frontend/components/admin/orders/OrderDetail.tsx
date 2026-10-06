"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Field } from "@/components/admin/Field";
import { MoneyField } from "@/components/admin/MoneyField";
import { ORDER_STATUS_TONES, PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/errors";
import { orderKeys, ordersApi, type AdminOrder } from "@/lib/admin/orders";
import { formatDateTime, formatPhone, formatRub, plural } from "@/lib/format";

type Step = AdminOrder["next_steps"][number];

function TrackingDialog({ step, order, onDone }: { step: Step | null; order: AdminOrder; onDone: () => void }) {
  const id = useId();
  const client = useQueryClient();
  const [tracking, setTracking] = useState(order.tracking_number ?? "");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => ordersApi.setStatus(order.id, { to: step!.to, tracking_number: tracking.trim() }),
    onSuccess: (next) => {
      client.setQueryData(orderKeys.detail(order.id), next);
      void client.invalidateQueries({ queryKey: ["orders", "list"] });
      toast.success("Заказ передан в доставку, покупателю ушло письмо с трек-номером");
      onDone();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open={step !== null} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Передать в доставку</DialogTitle>
          <DialogDescription>
            Оформите отправку в личном кабинете СДЭК и впишите трек-номер — покупатель получит письмо со ссылкой на отслеживание.
          </DialogDescription>
        </DialogHeader>
        <Field id={id} label="Трек-номер СДЭК" hint="Номер отправления из личного кабинета СДЭК, например 1234567890.">
          <Input id={id} value={tracking} onChange={(e) => setTracking(e.target.value)} inputMode="numeric" autoFocus />
        </Field>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!tracking.trim() || mutation.isPending}>
            Передать в доставку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ order, open, onClose }: { order: AdminOrder; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const reasonId = useId();
  const [mode, setMode] = useState<"full" | "amount">("full");
  const [amount, setAmount] = useState<number | null>(null);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sum = mode === "full" ? order.refundable_kop : (amount ?? 0);
  const mutation = useMutation({
    mutationFn: () =>
      ordersApi.refund(order.id, {
        ...(mode === "amount" ? { amount_kop: amount ?? 0 } : {}),
        restock,
        reason: reason.trim() || null,
      }),
    onSuccess: (next) => {
      client.setQueryData(orderKeys.detail(order.id), next);
      void client.invalidateQueries({ queryKey: ["orders", "list"] });
      toast.success("Возврат отправлен в банк. Чек возврата придёт покупателю автоматически.");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const invalid = sum <= 0 || sum > order.refundable_kop;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Вернуть деньги</DialogTitle>
          <DialogDescription>
            Деньги вернутся на карту покупателя через банк «Точка» за 1–5 дней. Можно вернуть до {formatRub(order.refundable_kop)}.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "full" | "amount")} className="gap-3">
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal">
            <RadioGroupItem value="full" aria-label="Всю сумму" />
            Всю сумму — {formatRub(order.refundable_kop)}
          </Label>
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal">
            <RadioGroupItem value="amount" aria-label="Часть суммы" />
            Часть суммы
          </Label>
        </RadioGroup>
        {mode === "amount" ? (
          <MoneyField
            label="Сумма возврата"
            value={amount}
            onChange={setAmount}
            error={amount !== null && amount > order.refundable_kop ? `Не больше ${formatRub(order.refundable_kop)}` : null}
          />
        ) : null}
        <Label className="flex min-h-11 items-center gap-3 font-normal">
          <Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} aria-label="Вернуть товары на склад" />
          Вернуть товары на склад
        </Label>
        <Field id={reasonId} label="Причина (увидите только вы)">
          <Input id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-sm text-muted-foreground">
          Баллы пересчитаем сами: начисленные за этот заказ спишем, потраченные — вернём (при частичном возврате — пропорционально).
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Не возвращать
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={invalid || mutation.isPending}>
            Вернуть {formatRub(sum)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Money({ label, kop, accent, testId, strong }: { label: string; kop: number; accent?: boolean; testId?: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd data-testid={testId} className={strong ? "text-lg font-semibold tabular-nums" : accent ? "text-red-700 tabular-nums" : "tabular-nums"}>
        {formatRub(kop)}
      </dd>
    </div>
  );
}

export function OrderView({ order }: { order: AdminOrder }) {
  const client = useQueryClient();
  const { isOwner } = useAdmin();
  const noteId = useId();
  const reasonId = useId();
  const [trackingStep, setTrackingStep] = useState<Step | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [note, setNote] = useState(order.internal_comment ?? "");
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");

  const update = (next: AdminOrder) => {
    client.setQueryData(orderKeys.detail(order.id), next);
    void client.invalidateQueries({ queryKey: ["orders", "list"] });
    void client.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const step = useMutation({
    mutationFn: (s: Step) => ordersApi.setStatus(order.id, { to: s.to }),
    onSuccess: (next) => {
      update(next);
      toast.success(`Статус: ${next.status_label}`);
    },
  });
  const saveNote = useMutation({
    mutationFn: () => ordersApi.patch(order.id, { internal_comment: note }),
    onSuccess: (next) => {
      update(next);
      toast.success("Заметка сохранена");
    },
  });

  const paidOnline = order.paid_at !== null && order.payment_method === "online";
  const canCancelHere = order.can_cancel && (isOwner || !paidOnline);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: "Все заказы" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Заказ {order.number}
            <StatusBadge tone={ORDER_STATUS_TONES[order.status]}>{order.status_label}</StatusBadge>
          </span>
        }
        description={`${formatDateTime(order.created_at)} · ${order.payment_method === "on_delivery" ? "оплата при получении" : order.paid_at ? `оплачен ${formatDateTime(order.paid_at)}` : "не оплачен"}`}
      />

      {order.next_steps.length ? (
        <div className="mb-5 flex flex-col gap-2 sm:flex-row">
          {order.next_steps.map((s) => (
            <Button
              key={s.to}
              size="lg"
              className="w-full sm:w-auto"
              disabled={step.isPending}
              onClick={() => (s.needs_tracking ? setTrackingStep(s) : step.mutate(s))}
            >
              {s.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/admin/orders/${order.id}/print`}>
            <Printer aria-hidden="true" />
            Упаковочный лист
          </Link>
        </Button>
        {canCancelHere ? (
          <ConfirmAction
            trigger="Отменить заказ"
            title={`Отменить заказ ${order.number}?`}
            description={
              paidOnline
                ? `${formatRub(order.refundable_kop)} вернутся покупателю на карту через банк, покупателю уйдёт письмо об отмене.`
                : "Заказ ещё не оплачен. Покупателю ничего не придёт, списанные баллы вернутся на его счёт."
            }
            confirm="Да, отменить"
            cancel="Не отменять"
            onConfirm={async () => {
              const next = await ordersApi.cancel(order.id, { restock, reason: reason.trim() || null });
              update(next);
              toast.success("Заказ отменён");
            }}
          >
            <Label className="flex min-h-11 items-center gap-3 font-normal">
              <Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} aria-label="Вернуть товары на склад" />
              Вернуть товары на склад
            </Label>
            <Field id={reasonId} label="Причина (увидите только вы)">
              <Input id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </ConfirmAction>
        ) : null}
        {order.can_cancel && !canCancelHere ? (
          <p className="self-center text-sm text-muted-foreground">Отменить оплаченный заказ может только владелец — понадобится возврат денег.</p>
        ) : null}
        {isOwner && order.can_refund ? (
          <Button variant="outline" onClick={() => setRefundOpen(true)}>
            Вернуть деньги
          </Button>
        ) : null}
      </div>

      {/* на телефоне — одна колонка в порядке важности: состав, покупатель, доставка, заметки… */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Состав" id="order-items" className="order-1 lg:order-none">
            <ul className="-mx-1 flex flex-col">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 border-b px-1 py-3 last:border-b-0">
                  <span className="flex flex-col">
                    {item.product_id ? (
                      <Link href={`/admin/products/${item.product_id}`} className="font-medium hover:underline">
                        {item.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.name}</span>
                    )}
                    <span className="text-[15px]">
                      {item.variant_label} × {item.qty}
                    </span>
                    {item.promotion ? <span className="text-sm text-red-700">{item.promotion}</span> : null}
                  </span>
                  <span className="flex flex-col items-end tabular-nums">
                    <span>{formatRub(item.line_total_kop - item.product_discount_kop)}</span>
                    {item.product_discount_kop ? <s className="text-sm text-muted-foreground">{formatRub(item.line_total_kop)}</s> : null}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-[15px]">
              <Money label="Товары" kop={order.items_total_kop} />
              {order.product_discount_kop ? <Money label="Скидки на товары" kop={-order.product_discount_kop} accent /> : null}
              {order.order_discount_kop ? (
                <Money label={order.promo_code ? `Промокод ${order.promo_code}` : "Скидка на первый заказ"} kop={-order.order_discount_kop} accent />
              ) : null}
              {order.points_spent ? <Money label="Оплачено баллами" kop={-order.points_spent * 100} accent /> : null}
              <Money label={`Доставка (${order.delivery_label})`} kop={order.delivery_kop} />
              <Money label="Итого" kop={order.total_kop} strong testId="order-total" />
              {order.refunded_kop ? <Money label="Возвращено" kop={-order.refunded_kop} accent /> : null}
            </dl>
            {order.discount_notes.length ? (
              <ul className="mt-3 text-sm text-muted-foreground">
                {order.discount_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          <SectionCard title="Заметки" id="order-note" className="order-4 lg:order-none">
            <div className="flex flex-col gap-3">
              <Textarea
                id={noteId}
                aria-label="Заметка для себя"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Покупатель не увидит. Например: положить пробник шу пуэра"
              />
              <Button variant="outline" className="self-start" onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>
                Сохранить заметку
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="История" id="order-history" className="order-6 lg:order-none">
            <ol className="flex flex-col gap-3">
              {order.history.map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-l-2 pl-3">
                  <span className="font-medium">{h.to_label}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(h.created_at)} · {h.actor_name ?? (h.actor_type === "system" ? "автоматически" : "покупатель")}
                  </span>
                  {h.comment ? <span className="text-sm">{h.comment}</span> : null}
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Покупатель" id="order-customer" className="order-2 lg:order-none">
            <div className="flex flex-col gap-1.5 text-[15px]">
              {order.customer ? (
                <Link href={`/admin/customers/${order.customer.id}`} className="font-medium hover:underline">
                  {order.name}
                </Link>
              ) : (
                <span className="font-medium">{order.name}</span>
              )}
              <a href={`tel:${order.phone}`} className="underline underline-offset-2">
                {formatPhone(order.phone)}
              </a>
              <a href={`mailto:${order.email}`} className="text-muted-foreground underline underline-offset-2">
                {order.email}
              </a>
              {order.customer ? (
                <span className="text-sm text-muted-foreground">
                  {order.customer.orders_count} {plural(order.customer.orders_count, "заказ", "заказа", "заказов")} · {order.customer.points_balance}{" "}
                  {plural(order.customer.points_balance, "балл", "балла", "баллов")}
                </span>
              ) : null}
            </div>
            {order.customer_comment ? (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[15px]">
                <span className="block text-sm text-muted-foreground">Комментарий покупателя</span>
                {order.customer_comment}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Доставка" id="order-delivery" className="order-3 lg:order-none">
            <div className="flex flex-col gap-1.5 text-[15px]">
              <span className="font-medium">{order.delivery_label}</span>
              <span>{order.delivery_summary}</span>
              {order.tracking_number ? (
                <span>
                  Трек:{" "}
                  {order.tracking_url ? (
                    <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="underline">
                      {order.tracking_number}
                    </a>
                  ) : (
                    order.tracking_number
                  )}
                </span>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Баллы" id="order-points" className="order-5 lg:order-none">
            <dl className="flex flex-col gap-1.5 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Списано</dt>
                <dd>{order.points_spent}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{order.points_earned ? "Начислено" : "Начислим после выполнения"}</dt>
                <dd>{order.points_earned || order.points_to_earn}</dd>
              </div>
            </dl>
          </SectionCard>

          {order.refunds.length ? (
            <SectionCard title="Возвраты" id="order-refunds" className="order-7 lg:order-none">
              <ul className="flex flex-col gap-2 text-[15px]">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>
                      {formatDateTime(r.created_at)}
                      {r.reason ? <span className="block text-sm text-muted-foreground">{r.reason}</span> : null}
                    </span>
                    <span className="tabular-nums">{formatRub(r.amount_kop)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <TrackingDialog step={trackingStep} order={order} onDone={() => setTrackingStep(null)} />
      {refundOpen ? <RefundDialog order={order} open={refundOpen} onClose={() => setRefundOpen(false)} /> : null}
    </>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const query = useQuery({ queryKey: orderKeys.detail(id), queryFn: () => ordersApi.get(id) });
  return <QueryState query={query}>{(order) => <OrderView order={order} />}</QueryState>;
}
