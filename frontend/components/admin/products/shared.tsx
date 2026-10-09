"use client";

import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { Field } from "@/components/admin/Field";
import type { Tone } from "@/components/admin/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { categoriesApi, categoryKeys, categoryOptions } from "@/lib/admin/categories";
import {
  PRICE_BASES,
  PRODUCT_TYPE_LABELS,
  productKeys,
  productsApi,
  stepTitle,
  WIZARD_STEP_COUNT,
  type PriceBase,
  type ProductState,
  type ProductType,
} from "@/lib/admin/products";
import { cn } from "@/lib/utils";

import { NativeSelect } from "./inputs";

/** Статус товара — текстом и цветом. */
export const PRODUCT_STATE_TONES: Record<ProductState, Tone> = {
  published: "success",
  hidden: "warning",
  draft: "info",
  archived: "neutral",
};

export function ProductThumb({ src, className }: { src: string | null | undefined; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- миниатюра из медиатеки
    <img src={src} alt="" className={cn("size-14 shrink-0 rounded-lg object-cover", className)} />
  ) : (
    <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted", className)}>
      <Package className="size-5 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/** Граммовки и пороги «Осталось мало» из «Настройки → Каталог» (доступно с правом «Товары»). */
export function useProductOptions() {
  return useQuery({ queryKey: productKeys.options, queryFn: productsApi.options, staleTime: 300_000 });
}

export function useCategories() {
  return useQuery({ queryKey: categoryKeys.list(false), queryFn: () => categoriesApi.list() });
}

export function CategorySelect({
  value,
  onChange,
  error,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string | null;
}) {
  const id = useId();
  const tree = useCategories();
  const options = categoryOptions(tree.data ?? []);
  return (
    <Field
      id={id}
      label="Категория"
      hint="Раздел каталога, в котором покупатель найдёт товар, например «Улун» или «Посуда». Без категории товар нельзя показать на сайте."
      error={error}
      description={
        <Link href="/admin/products/categories" className="underline underline-offset-2">
          Добавить или переименовать категории
        </Link>
      }
    >
      <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-invalid={error ? true : undefined}>
        <option value="">Не выбрана</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.depth ? `— ${o.name}` : o.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

export function NameField({ value, onChange, error }: { value: string; onChange: (name: string) => void; error?: string | null }) {
  const id = useId();
  return (
    <Field
      id={id}
      label="Название"
      required
      hint="Как товар будет называться на сайте, например «Да Хун Пао, 2023» или «Гайвань белая, 120 мл». Можно поменять позже."
      error={error}
    >
      <Input id={id} value={value} maxLength={200} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} />
    </Field>
  );
}

const TYPE_DESCRIPTIONS: Record<ProductType, string> = {
  tea: "Остаток в граммах, цена за грамм. Покупатель выбирает фасовку: 25, 50, 100 г или весь блин.",
  unit: "Посуда, аксессуары, наборы. Остаток в штуках, цена за штуку.",
};

export function TypePicker({ value, onChange }: { value: ProductType; onChange: (type: ProductType) => void }) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ProductType)}
      aria-label="Что добавляем?"
      className="grid gap-3 sm:grid-cols-2"
    >
      {(["tea", "unit"] as const).map((type) => (
        <Label
          key={type}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 font-normal",
            value === type && "border-foreground ring-1 ring-foreground",
          )}
        >
          <RadioGroupItem value={type} aria-label={PRODUCT_TYPE_LABELS[type]} className="mt-0.5" />
          <span className="flex flex-col gap-1">
            <span className="text-base font-medium">{PRODUCT_TYPE_LABELS[type]}</span>
            <span className="text-sm leading-snug text-muted-foreground">{TYPE_DESCRIPTIONS[type]}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

/** «Цена за: 1 г / 50 г / 100 г» — как владельцу удобнее вводить цену чая. */
export function PriceBasePicker({ value, onChange }: { value: PriceBase; onChange: (base: PriceBase) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[15px] font-medium">
        Цена за
      </span>
      <RadioGroup
        value={String(value)}
        onValueChange={(v) => onChange(Number(v) as PriceBase)}
        aria-labelledby={labelId}
        className="flex flex-wrap gap-2"
      >
        {PRICE_BASES.map((base) => (
          <Label
            key={base}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3.5 font-normal",
              value === base && "border-foreground",
            )}
          >
            <RadioGroupItem value={String(base)} aria-label={`${base} г`} />
            {base} г
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Индикатор «Шаг N из 7»: к пройденным шагам можно вернуться, вперёд — только кнопкой «Далее». */
export function WizardSteps({
  step,
  maxStep,
  type,
  onGo,
  status,
}: {
  step: number;
  maxStep: number;
  type: ProductType;
  onGo: (step: number) => void;
  status?: string;
}) {
  const steps = Array.from({ length: WIZARD_STEP_COUNT }, (_, i) => i + 1);
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] font-medium">{`Шаг ${step} из ${WIZARD_STEP_COUNT}`}</p>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {status}
        </p>
      </div>
      <nav aria-label="Шаги">
        <ol className="grid grid-cols-7 gap-1">
          {steps.map((n) => {
            const title = stepTitle(n, type);
            const current = n === step;
            const passed = n < step || (n <= maxStep && !current);
            return (
              <li key={n} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={`Шаг ${n}: ${title}`}
                  aria-current={current ? "step" : undefined}
                  disabled={n > maxStep}
                  onClick={() => onGo(n)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full border text-[15px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    current
                      ? "border-foreground bg-foreground text-background"
                      : passed
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        : "bg-card hover:bg-muted",
                  )}
                >
                  {n}
                </button>
                <span aria-hidden="true" className={cn("hidden text-center text-xs leading-tight lg:block", current ? "font-medium" : "text-muted-foreground")}>
                  {title}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
