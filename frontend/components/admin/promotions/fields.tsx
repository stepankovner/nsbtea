"use client";

/** Общие поля раздела «Акции»: дата и время по Москве, размер скидки, категории, копирование кода. */
import { useQuery } from "@tanstack/react-query";
import { Copy, Lock, Package, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { toast } from "sonner";

import { describedBy, Field } from "@/components/admin/Field";
import { Hint } from "@/components/admin/Hint";
import { MoneyField } from "@/components/admin/MoneyField";
import { EmptyState } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { promotionKeys, promotionsApi, type AdminCategory } from "@/lib/admin/promotions";
import type { Schemas } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function NoAccess({ section }: { section: string }) {
  return (
    <EmptyState icon={Lock} title={`Нет доступа к разделу «${section}»`}>
      Попросите владельца магазина открыть этот раздел в настройках сотрудников.
    </EmptyState>
  );
}

export type DateTimeValue = { date: string; time: string };

/** Дата и время по Москве: два поля, на телефоне открываются системные «календарь» и «часы». */
export function DateTimeField({
  label,
  hint,
  value,
  onChange,
  defaultTime,
  description,
  error,
}: {
  label: string;
  hint?: ReactNode;
  value: DateTimeValue;
  onChange: (value: DateTimeValue) => void;
  /** какое время подставить, когда выбрали только дату */
  defaultTime: string;
  description?: ReactNode;
  error?: string | null;
}) {
  const id = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={describedBy(id, error, description)}>
      <legend className="mb-1.5 flex min-h-7 items-center gap-1 text-[15px] font-medium">
        {label}
        {hint ? <Hint label={label}>{hint}</Hint> : null}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-2">
        <Input
          type="date"
          aria-label={`${label}: дата`}
          value={value.date}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange({ date: e.target.value, time: e.target.value && !value.time ? defaultTime : value.time })}
        />
        <Input
          type="time"
          aria-label={`${label}: время`}
          value={value.time}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
        />
      </div>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        {error ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
          </p>
        ) : description ? (
          <p id={`${id}-description`} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : (
          <span />
        )}
        {value.date || value.time ? (
          <Button type="button" variant="ghost" onClick={() => onChange({ date: "", time: "" })} aria-label={`Очистить: ${label}`}>
            Очистить
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

export type DiscountKind = "percent" | "amount";

/** Размер скидки: проценты (целые) или рубли (MoneyField, в копейках). */
export function DiscountFields({
  kind,
  onKind,
  percent,
  onPercent,
  amount,
  onAmount,
  amountHint,
  error,
}: {
  kind: DiscountKind;
  onKind: (kind: DiscountKind) => void;
  percent: string;
  onPercent: (text: string) => void;
  amount: number | null;
  onAmount: (kop: number | null) => void;
  amountHint: ReactNode;
  error?: string | null;
}) {
  const percentId = useId();
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup value={kind} onValueChange={(v) => onKind(v as DiscountKind)} className="grid-cols-2 gap-2" aria-label="Как считать скидку">
        <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[15px] font-normal">
          <RadioGroupItem value="percent" aria-label="В процентах" />В процентах
        </Label>
        <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[15px] font-normal">
          <RadioGroupItem value="amount" aria-label="В рублях" />В рублях
        </Label>
      </RadioGroup>
      {kind === "percent" ? (
        <Field
          id={percentId}
          label="Скидка, %"
          required
          error={error}
          hint="Целое число от 1 до 99. Например, 15 — товар за 1 000 ₽ будет стоить 850 ₽. Цена со скидкой округляется до целого рубля."
        >
          <div className="relative max-w-40">
            <Input
              id={percentId}
              inputMode="numeric"
              autoComplete="off"
              value={percent}
              onChange={(e) => onPercent(e.target.value.replace(/[^\d]/g, ""))}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy(percentId, error)}
              className="pr-9 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
          </div>
        </Field>
      ) : (
        <MoneyField label="Скидка, ₽" required value={amount} onChange={onAmount} hint={amountHint} error={error} className="max-w-56" />
      )}
    </div>
  );
}

function flatten(tree: AdminCategory[]): { category: AdminCategory; child: boolean }[] {
  return tree.flatMap((root) => [{ category: root, child: false }, ...root.children.map((c) => ({ category: c, child: true }))]);
}

/**
 * Выбор категорий. Список категорий отдаётся только с доступом к товарам;
 * без него видны и снимаются уже выбранные.
 */
export function CategoryPicker({
  value,
  onChange,
  known,
  hint,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** выбранные категории с названиями (из ответа сервера) */
  known: Schemas["CategoryBrief"][];
  hint: ReactNode;
}) {
  const { can } = useAdmin();
  const allowed = can("products");
  const tree = useQuery({ queryKey: promotionKeys.categories, queryFn: () => promotionsApi.categories(), enabled: allowed, staleTime: 5 * 60_000 });
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id));

  const names: Record<string, string> = {};
  for (const c of known) names[c.id] = c.name;
  for (const { category } of flatten(tree.data ?? [])) names[category.id] = category.name;

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 flex min-h-7 items-center gap-1 text-[15px] font-medium">
        Категории
        <Hint label="Категории">{hint}</Hint>
      </legend>
      {allowed && tree.data ? (
        tree.data.length ? (
          <ul className="flex flex-col gap-1">
            {flatten(tree.data).map(({ category, child }) => (
              <li key={category.id} className={cn(child && "pl-7")}>
                <Label className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-[15px] font-normal hover:bg-muted">
                  <Checkbox
                    checked={value.includes(category.id)}
                    onCheckedChange={(on) => toggle(category.id, on === true)}
                    aria-label={category.name}
                  />
                  <span className="flex-1">{category.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{category.products_count}</span>
                </Label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Категорий пока нет.</p>
        )
      ) : allowed && tree.isPending ? (
        <p className="text-sm text-muted-foreground">Загружаем категории…</p>
      ) : (
        <>
          {value.length ? (
            <ul className="flex flex-wrap gap-2">
              {value.map((id) => (
                <li key={id} className="flex min-h-11 items-center gap-1 rounded-full border bg-card pl-3.5">
                  <span>{names[id] ?? "Категория"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    aria-label={`Убрать категорию: ${names[id] ?? "категория"}`}
                    onClick={() => onChange(value.filter((v) => v !== id))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {tree.isError ? "Не удалось загрузить категории. " : ""}
            Выбрать новые категории может владелец или сотрудник с доступом к разделу «Товары».
          </p>
        </>
      )}
    </fieldset>
  );
}

/** «Скопировать» — промокод в буфер обмена, чтобы отправить покупателям. */
export function CopyButton({ text, iconOnly = false }: { text: string; iconOnly?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Промокод ${text} скопирован`);
    } catch {
      toast.error("Не удалось скопировать — выделите код и скопируйте вручную");
    }
  }
  return iconOnly ? (
    <Button type="button" variant="ghost" size="icon" onClick={() => void copy()} aria-label={`Скопировать промокод ${text}`}>
      <Copy aria-hidden="true" />
    </Button>
  ) : (
    <Button type="button" variant="outline" onClick={() => void copy()} disabled={!text.trim()}>
      <Copy aria-hidden="true" />
      Скопировать
    </Button>
  );
}

/** Миниатюра товара (как в выборе товаров). */
export function ProductThumb({ product }: { product: Pick<Schemas["ProductBrief"], "image_url"> }) {
  return product.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- миниатюра из медиатеки
    <img src={product.image_url} alt="" className="size-9 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
      <Package className="size-4 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/** Поле-переключатель «включено» с подписью и подсказкой. */
export function ActiveSwitchLabel({ htmlFor, label, hint }: { htmlFor: string; label: string; hint: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className="text-[15px] font-medium">
        {label}
      </Label>
      <Hint label={label}>{hint}</Hint>
    </span>
  );
}
