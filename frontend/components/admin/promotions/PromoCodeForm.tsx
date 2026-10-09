"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TicketPercent } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { MoneyField } from "@/components/admin/MoneyField";
import { EmptyState, PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  endToIso,
  isoToEnd,
  isoToMoscow,
  isValidPromoCode,
  moscowToIso,
  normalizePromoCode,
  parseLimit,
  parsePercent,
  PERCENT_ERROR,
  PROMO_CODE_ERROR,
  promoCodeStatus,
  promotionKeys,
  promotionsApi,
  usageText,
  type PromoCode,
  type PromoCodeBody,
} from "@/lib/admin/promotions";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";

import { ActiveSwitchLabel, CategoryPicker, CopyButton, DateTimeField, DiscountFields, NoAccess, type DiscountKind } from "./fields";

const BACK = { href: "/admin/promotions", label: "Все акции" };
const CODES_ARCHIVE = "/admin/promotions?archive=codes";
const LIMIT_ERROR = "Введите целое число больше нуля или оставьте поле пустым";
const FIELDS = new Set([
  "code",
  "percent",
  "amount_kop",
  "amount",
  "min_order_kop",
  "max_uses",
  "max_uses_per_customer",
  "starts_at",
  "ends_at",
  "description",
]);

function LimitField({ label, hint, value, onChange, error }: { label: string; hint: ReactNode; value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} description="Пусто — без ограничения.">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, "Пусто — без ограничения.")}
        className="max-w-40 tabular-nums"
      />
    </Field>
  );
}

function CheckRow({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Label className="flex items-start gap-3 rounded-lg border px-3 py-3 font-normal">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label={label} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </Label>
  );
}

function PromoCodeEditor({ promo }: { promo: PromoCode | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const codeId = useId();
  const descriptionId = useId();
  const activeId = useId();

  const [code, setCode] = useState(promo?.code ?? "");
  const [description, setDescription] = useState(promo?.description ?? "");
  const [kind, setKind] = useState<DiscountKind>(promo?.amount_kop != null ? "amount" : "percent");
  const [percent, setPercent] = useState(promo?.percent != null ? String(promo.percent) : "");
  const [amount, setAmount] = useState<number | null>(promo?.amount_kop ?? null);
  const [minOrder, setMinOrder] = useState<number | null>(promo?.min_order_kop || null);
  const [maxUses, setMaxUses] = useState(promo?.max_uses != null ? String(promo.max_uses) : "");
  const [perCustomer, setPerCustomer] = useState(promo?.max_uses_per_customer != null ? String(promo.max_uses_per_customer) : "");
  const [firstOnly, setFirstOnly] = useState(promo?.first_order_only ?? false);
  const [onDiscounted, setOnDiscounted] = useState(promo?.applies_to_discounted ?? false);
  const [productIds, setProductIds] = useState<string[]>(promo?.products.map((p) => p.id) ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(promo?.categories.map((c) => c.id) ?? []);
  const [start, setStart] = useState(isoToMoscow(promo?.starts_at));
  const [end, setEnd] = useState(isoToEnd(promo?.ends_at));
  const [active, setActive] = useState(promo?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: PromoCodeBody) => (promo ? promotionsApi.updateCode(promo.id, body) : promotionsApi.createCode(body)),
    onSuccess: (saved) => {
      client.setQueryData<PromoCode[]>(promotionKeys.codes, (old) =>
        old ? (promo ? old.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...old]) : old,
      );
      void client.invalidateQueries({ queryKey: promotionKeys.codes });
      if (promo) {
        toast.success("Промокод сохранён");
      } else {
        toast.success(`Промокод ${saved.code} создан — можно отправлять покупателям`);
        router.push("/admin/promotions");
      }
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? fieldErrors(e) : {};
      setErrors(fields);
      setFormError(Object.keys(fields).some((f) => FIELDS.has(f)) ? "Проверьте поля, отмеченные красным" : errorMessage(e));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const normalized = normalizePromoCode(code);
    if (!normalized) next.code = "Придумайте промокод, например CHAI10";
    else if (!isValidPromoCode(normalized)) next.code = PROMO_CODE_ERROR;
    const pct = kind === "percent" ? parsePercent(percent) : null;
    if (kind === "percent" && pct === null) next.percent = PERCENT_ERROR;
    if (kind === "amount" && !amount) next.amount_kop = "Введите сумму скидки в рублях, например 300";
    const uses = parseLimit(maxUses);
    const perOne = parseLimit(perCustomer);
    if (Number.isNaN(uses)) next.max_uses = LIMIT_ERROR;
    if (Number.isNaN(perOne)) next.max_uses_per_customer = LIMIT_ERROR;
    const startsAt = moscowToIso(start.date, start.time);
    const endsAt = endToIso(end.date, end.time);
    if (start.time && !start.date) next.starts_at = "Укажите дату начала";
    if (end.time && !end.date) next.ends_at = "Укажите дату окончания";
    if (startsAt && endsAt && endsAt <= startsAt) next.ends_at = "Окончание должно быть позже начала";
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError("Проверьте поля, отмеченные красным");
      return;
    }
    setFormError(null);
    save.mutate({
      code: normalized,
      description: description.trim() || null,
      percent: pct,
      amount_kop: kind === "amount" ? amount : null,
      min_order_kop: minOrder ?? 0,
      max_uses: uses,
      max_uses_per_customer: perOne,
      first_order_only: firstOnly,
      applies_to_discounted: onDiscounted,
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: active,
      product_ids: productIds,
      category_ids: categoryIds,
    });
  }

  const discountError = errors.percent ?? errors.amount_kop ?? errors.amount ?? null;
  const status = promo ? promoCodeStatus(promo) : null;

  return (
    <>
      <PageHeader
        back={BACK}
        title={
          promo ? (
            <span className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 font-mono break-all">{promo.code}</span>
              {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
            </span>
          ) : (
            "Новый промокод"
          )
        }
        description="Слово, которое покупатель вводит в корзине, чтобы получить скидку на заказ. Со скидкой на первый заказ не суммируется — покупатель получит более выгодную."
      />

      <form onSubmit={submit} noValidate className="flex max-w-3xl flex-col gap-5">
        {promo ? (
          <p className="rounded-xl border bg-card px-4 py-3 text-[15px]">
            <span className="text-muted-foreground">Использовали в заказах: </span>
            {usageText(promo.stats)}
          </p>
        ) : null}

        <SectionCard title="Код и скидка" id="code-main">
          <div className="flex flex-col gap-4">
            <Field
              id={codeId}
              label="Промокод"
              required
              error={errors.code}
              description="Маленькие буквы станут заглавными сами."
              hint="Латинские буквы, цифры, дефис или подчёркивание, от 3 до 32 символов. Покупатель вводит код в корзине. Например: CHAI10 или OSEN-2026."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={codeId}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                  maxLength={32}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={errors.code ? true : undefined}
                  aria-describedby={errors.code ? `${codeId}-error` : `${codeId}-description`}
                  className="font-mono text-lg tracking-wide sm:max-w-72"
                />
                <CopyButton text={normalizePromoCode(code)} />
              </div>
            </Field>
            {errors.code?.includes("в архиве") ? (
              // такой код уже есть в архиве — проще восстановить его, чем заводить новый
              <Button asChild variant="outline" className="self-start">
                <Link href={CODES_ARCHIVE}>Открыть архив промокодов</Link>
              </Button>
            ) : null}
            <Field
              id={descriptionId}
              label="Заметка для себя"
              error={errors.description}
              hint="Покупатель её не увидит. Например: «раздавали на дегустации 12 октября» или «для подписчиков Telegram»."
            >
              <Input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            </Field>
            <DiscountFields
              kind={kind}
              onKind={setKind}
              percent={percent}
              onPercent={setPercent}
              amount={amount}
              onAmount={setAmount}
              error={discountError}
              amountHint="Скидка на весь заказ (или на выбранные ниже товары). Например, 300 ₽: заказ на 2 000 ₽ обойдётся в 1 700 ₽."
            />
          </div>
        </SectionCard>

        <SectionCard title="Условия" id="code-limits">
          <div className="flex flex-col gap-4">
            <MoneyField
              label="Минимальная сумма заказа"
              value={minOrder}
              onChange={setMinOrder}
              error={errors.min_order_kop}
              className="max-w-56"
              description="Пусто — с любой суммы."
              hint="Считаем по товарам после скидок на товары, без доставки. Например, 2 000 ₽ — промокод сработает, только если товаров в корзине на 2 000 ₽ или больше."
            />
            <LimitField
              label="Сколько раз можно использовать всего"
              value={maxUses}
              onChange={setMaxUses}
              error={errors.max_uses}
              hint="Сколько заказов всего можно оформить с этим кодом. Например, 50 — для первых 50 покупателей."
            />
            <LimitField
              label="Сколько раз — одному покупателю"
              value={perCustomer}
              onChange={setPerCustomer}
              error={errors.max_uses_per_customer}
              hint="Например, 1 — каждый покупатель сможет применить код только один раз."
            />
            <CheckRow label="Только на первый заказ" checked={firstOnly} onChange={setFirstOnly}>
              Сработает, только если покупатель раньше ничего не заказывал.
            </CheckRow>
            <CheckRow label="Действует и на товары со скидкой" checked={onDiscounted} onChange={setOnDiscounted}>
              Обычно промокод не применяется к товарам, на которые уже есть акция или чай недели. Отметьте, если скидки должны складываться.
            </CheckRow>
          </div>
        </SectionCard>

        <SectionCard title="На какие товары" id="code-scope">
          <div className="flex flex-col gap-5">
            <p className="text-[15px] text-muted-foreground">Необязательно. Ничего не выбрано — промокод действует на весь заказ.</p>
            <ProductPicker
              label="Только на эти товары"
              value={productIds}
              onChange={setProductIds}
              hint="Скидка по коду посчитается только с этих товаров. Например: Да Хун Пао."
            />
            <CategoryPicker
              value={categoryIds}
              onChange={setCategoryIds}
              known={promo?.categories ?? []}
              hint="Скидка по коду — только на товары этих категорий. Например, «Пуэры»."
            />
          </div>
        </SectionCard>

        <SectionCard title="Когда действует" id="code-dates">
          <div className="flex flex-col gap-4">
            <DateTimeField
              label="Начало"
              value={start}
              onChange={setStart}
              defaultTime="00:00"
              error={errors.starts_at}
              description="По московскому времени. Пусто — сразу после сохранения."
              hint="С какого момента код начнёт работать, по Москве. Например: 10.10.2026, 00:00."
            />
            <DateTimeField
              label="Окончание"
              value={end}
              onChange={setEnd}
              defaultTime="23:59"
              error={errors.ends_at}
              description="По московскому времени. Пусто — без срока."
              hint="Последняя минута, когда код ещё работает, по Москве. Например: 31.10.2026, 23:59 — весь день 31 октября."
            />
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3">
              <ActiveSwitchLabel
                htmlFor={activeId}
                label="Промокод включён"
                hint="Выключенный код не сработает, даже если подходят даты. Удобно, чтобы временно остановить код и потом включить снова."
              />
              <Switch id={activeId} checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        </SectionCard>

        {formError ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[15px] text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={save.isPending}>
            {save.isPending ? "Сохраняем…" : promo ? "Сохранить" : "Создать промокод"}
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/admin/promotions">Отмена</Link>
          </Button>
        </div>
      </form>

      {promo ? (
        <div className="mt-8 flex max-w-3xl flex-col gap-2 border-t pt-5">
          <ConfirmAction
            trigger="Убрать в архив"
            title={`Убрать промокод ${promo.code} в архив?`}
            description="Код сразу перестанет действовать: покупатель, который введёт его в корзине, увидит, что такого кода нет. Скидки в уже оформленных заказах сохранятся. Код можно вернуть из архива (вкладка «Архив» в разделе «Промокоды») — он вернётся выключенным. Для короткой паузы проще выключить его переключателем «Промокод включён»."
            confirm="Да, убрать в архив"
            cancel="Не убирать"
            onConfirm={async () => {
              await promotionsApi.archiveCode(promo.id);
              client.setQueryData<PromoCode[]>(promotionKeys.codes, (old) => old?.filter((c) => c.id !== promo.id));
              void client.invalidateQueries({ queryKey: promotionKeys.codes });
              void client.invalidateQueries({ queryKey: promotionKeys.codesArchived });
              toast.success(`Промокод ${promo.code} убран в архив`);
              router.push("/admin/promotions");
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function EditPromoCode({ id }: { id: string }) {
  // отдельного запроса «один промокод» в API нет — берём из списка
  const list = useQuery({ queryKey: promotionKeys.codes, queryFn: () => promotionsApi.codes() });
  return (
    <QueryState query={list}>
      {(items) => {
        const promo = items.find((c) => c.id === id);
        return promo ? (
          <PromoCodeEditor key={promo.id} promo={promo} />
        ) : (
          <>
            <PageHeader back={BACK} title="Промокод" />
            <EmptyState
              icon={TicketPercent}
              title="Промокод не найден"
              action={
                <Button asChild variant="outline">
                  <Link href={CODES_ARCHIVE}>Открыть архив промокодов</Link>
                </Button>
              }
            >
              Возможно, его убрали в архив — оттуда код можно восстановить.
            </EmptyState>
          </>
        );
      }}
    </QueryState>
  );
}

/** Создание (`id` не задан) или изменение промокода. */
export function PromoCodeForm({ id }: { id?: string }) {
  const { can } = useAdmin();
  if (!can("promotions")) return <NoAccess section="Акции" />;
  return id ? <EditPromoCode id={id} /> : <PromoCodeEditor promo={null} />;
}
