"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Field } from "@/components/admin/Field";
import { EmptyState, PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  endToIso,
  isoToEnd,
  isoToMoscow,
  moscowToIso,
  parsePercent,
  PERCENT_ERROR,
  promotionKeys,
  promotionsApi,
  promotionStatus,
  usageText,
  type Promotion,
  type PromotionBody,
} from "@/lib/admin/promotions";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";

import { ActiveSwitchLabel, CategoryPicker, DateTimeField, DiscountFields, NoAccess, type DiscountKind } from "./fields";

const BACK = { href: "/admin/promotions", label: "Все акции" };
/** поля формы, у которых показываем ошибку сервера */
const FIELDS = new Set(["title", "percent", "amount_kop", "amount", "starts_at", "ends_at", "product_ids", "category_ids"]);

function PromotionEditor({ promotion }: { promotion: Promotion | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const titleId = useId();
  const activeId = useId();

  const [title, setTitle] = useState(promotion?.title ?? "");
  const [kind, setKind] = useState<DiscountKind>(promotion?.amount_kop != null ? "amount" : "percent");
  const [percent, setPercent] = useState(promotion?.percent != null ? String(promotion.percent) : "");
  const [amount, setAmount] = useState<number | null>(promotion?.amount_kop ?? null);
  const [productIds, setProductIds] = useState<string[]>(promotion?.products.map((p) => p.id) ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(promotion?.categories.map((c) => c.id) ?? []);
  const [start, setStart] = useState(isoToMoscow(promotion?.starts_at));
  const [end, setEnd] = useState(isoToEnd(promotion?.ends_at));
  const [active, setActive] = useState(promotion?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: PromotionBody) => (promotion ? promotionsApi.update(promotion.id, body) : promotionsApi.create(body)),
    onSuccess: (saved) => {
      client.setQueryData<Promotion[]>(promotionKeys.list, (old) =>
        old ? (promotion ? old.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...old]) : old,
      );
      void client.invalidateQueries({ queryKey: promotionKeys.list });
      if (promotion) {
        toast.success("Акция сохранена");
      } else {
        toast.success("Акция создана");
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
    if (!title.trim()) next.title = "Напишите название акции";
    const pct = kind === "percent" ? parsePercent(percent) : null;
    if (kind === "percent" && pct === null) next.percent = PERCENT_ERROR;
    if (kind === "amount" && !amount) next.amount_kop = "Введите сумму скидки в рублях, например 100";
    if (!productIds.length && !categoryIds.length) next.scope = "Выберите товары или категории, на которые действует акция";
    const startsAt = moscowToIso(start.date, start.time);
    const endsAt = endToIso(end.date, end.time);
    if (end.time && !end.date) next.ends_at = "Укажите дату окончания";
    if (start.time && !start.date) next.starts_at = "Укажите дату начала";
    if (startsAt && endsAt && endsAt <= startsAt) next.ends_at = "Окончание должно быть позже начала";
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError("Проверьте поля, отмеченные красным");
      return;
    }
    setFormError(null);
    save.mutate({
      title: title.trim(),
      percent: pct,
      amount_kop: kind === "amount" ? amount : null,
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: active,
      product_ids: productIds,
      category_ids: categoryIds,
    });
  }

  const discountError = errors.percent ?? errors.amount_kop ?? errors.amount ?? null;
  const scopeError = errors.scope ?? errors.product_ids ?? errors.category_ids ?? null;
  const status = promotion ? promotionStatus(promotion) : null;

  return (
    <>
      <PageHeader
        back={BACK}
        title={
          promotion ? (
            <span className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">{promotion.title}</span>
              {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
            </span>
          ) : (
            "Новая акция"
          )
        }
        description="Скидка на выбранные товары или целые категории на время. Покупатели увидят старую и новую цену."
      />

      <form onSubmit={submit} noValidate className="flex max-w-3xl flex-col gap-5">
        {promotion ? (
          <p className="rounded-xl border bg-card px-4 py-3 text-[15px]">
            <span className="text-muted-foreground">Применили в заказах: </span>
            {usageText(promotion.stats)}
          </p>
        ) : null}

        <SectionCard title="Название и скидка" id="promo-main">
          <div className="flex flex-col gap-4">
            <Field
              id={titleId}
              label="Название акции"
              required
              error={errors.title}
              hint="Покупатель увидит его рядом с ценой и в корзине. Например: «Осенние улуны» или «Неделя пуэра»."
            >
              <Input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={errors.title ? true : undefined} />
            </Field>
            <DiscountFields
              kind={kind}
              onKind={setKind}
              percent={percent}
              onPercent={setPercent}
              amount={amount}
              onAmount={setAmount}
              error={discountError}
              amountHint="Штучный товар подешевеет на эту сумму за каждую штуку, чай на развес — за каждые 100 г. Например, 100 ₽: пачка 50 г станет дешевле на 50 ₽."
            />
          </div>
        </SectionCard>

        <SectionCard title="На что действует" id="promo-scope">
          <div className="flex flex-col gap-5">
            <ProductPicker
              label="Товары"
              value={productIds}
              onChange={setProductIds}
              hint="Найдите товар по названию и добавьте. Например: Да Хун Пао."
            />
            <CategoryPicker
              value={categoryIds}
              onChange={setCategoryIds}
              known={promotion?.categories ?? []}
              hint="Скидка на все товары категории, в том числе добавленные позже. Например, «Улуны». Если выбрать «Чай» — скидка на все его подкатегории."
            />
            {scopeError ? <p className="text-sm text-destructive">{scopeError}</p> : null}
            <p className="text-sm text-muted-foreground">
              Если на товар действует несколько скидок (эта акция, другая акция или чай недели), покупатель получит одну — самую большую.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Когда действует" id="promo-dates">
          <div className="flex flex-col gap-4">
            <DateTimeField
              label="Начало"
              value={start}
              onChange={setStart}
              defaultTime="00:00"
              error={errors.starts_at}
              description="По московскому времени. Пусто — сразу после сохранения."
              hint="Когда скидка включится сама, по Москве. Например: 10.10.2026, 00:00 — с начала дня 10 октября."
            />
            <DateTimeField
              label="Окончание"
              value={end}
              onChange={setEnd}
              defaultTime="23:59"
              error={errors.ends_at}
              description="По московскому времени. Пусто — без срока, пока не выключите."
              hint="Последняя минута скидки, по Москве. Например: 20.10.2026, 23:59 — скидка действует весь день 20 октября."
            />
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3">
              <ActiveSwitchLabel
                htmlFor={activeId}
                label="Акция включена"
                hint="Выключенная акция не действует, даже если подходят даты. Так можно поставить её на паузу и потом включить снова."
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
            {save.isPending ? "Сохраняем…" : promotion ? "Сохранить" : "Создать акцию"}
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/admin/promotions">Отмена</Link>
          </Button>
        </div>
      </form>

      {promotion ? (
        <div className="mt-8 flex max-w-3xl flex-col gap-2 border-t pt-5">
          <ConfirmAction
            trigger="Убрать в архив"
            title={`Убрать акцию «${promotion.title}» в архив?`}
            description="Акция сразу перестанет действовать — на сайте вернутся обычные цены. Она перейдёт во вкладку «Архив» раздела «Акции», скидки в уже оформленных заказах сохранятся. Акцию можно вернуть из архива — она вернётся выключенной. Для короткой паузы проще выключить её переключателем «Акция включена»."
            confirm="Да, убрать в архив"
            cancel="Не убирать"
            onConfirm={async () => {
              await promotionsApi.archive(promotion.id);
              client.setQueryData<Promotion[]>(promotionKeys.list, (old) => old?.filter((p) => p.id !== promotion.id));
              void client.invalidateQueries({ queryKey: promotionKeys.list });
              void client.invalidateQueries({ queryKey: promotionKeys.archived });
              toast.success("Акция убрана в архив");
              router.push("/admin/promotions");
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function EditPromotion({ id }: { id: string }) {
  // отдельного запроса «одна акция» в API нет — берём из списка
  const list = useQuery({ queryKey: promotionKeys.list, queryFn: () => promotionsApi.list() });
  return (
    <QueryState query={list}>
      {(items) => {
        const promotion = items.find((p) => p.id === id);
        return promotion ? (
          <PromotionEditor key={promotion.id} promotion={promotion} />
        ) : (
          <>
            <PageHeader back={BACK} title="Акция" />
            <EmptyState
              icon={Percent}
              title="Акция не найдена"
              action={
                <Button asChild variant="outline">
                  <Link href="/admin/promotions?archive=promotions">Открыть архив акций</Link>
                </Button>
              }
            >
              Возможно, её убрали в архив — оттуда акцию можно восстановить.
            </EmptyState>
          </>
        );
      }}
    </QueryState>
  );
}

/** Создание (`id` не задан) или изменение акции. */
export function PromotionForm({ id }: { id?: string }) {
  const { can } = useAdmin();
  if (!can("promotions")) return <NoAccess section="Акции" />;
  return id ? <EditPromotion id={id} /> : <PromotionEditor promotion={null} />;
}
