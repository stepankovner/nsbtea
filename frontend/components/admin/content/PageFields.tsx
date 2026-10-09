"use client";

/** Поля страницы, общие для создания и редактирования: вид, название, адрес. */
import { useId } from "react";

import { describedBy, Field } from "@/components/admin/Field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PAGE_KINDS, pageKind, slugify, type PageKind } from "@/lib/admin/content";
import { cn } from "@/lib/utils";

export function KindPicker({
  value,
  onChange,
  compact,
}: {
  value: PageKind;
  onChange: (kind: PageKind) => void;
  /** в узкой колонке — варианты друг под другом */
  compact?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-[15px] font-medium">
        Вид страницы
      </span>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as PageKind)}
        className={cn("gap-2", !compact && "md:grid-cols-3")}
      >
        {PAGE_KINDS.map((kind) => (
          <Label
            key={kind.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 font-normal",
              value === kind.value && "border-foreground",
            )}
          >
            <RadioGroupItem value={kind.value} aria-label={kind.label} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium">{kind.label}</span>
              <span className="text-sm text-muted-foreground">{kind.description}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

export function TitleField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field
      id={id}
      label="Название страницы"
      error={error}
      hint="Крупный заголовок на странице и в меню сайта. Например: «Доставка и оплата»."
    >
      <Input
        id={id}
        value={value}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error)}
      />
    </Field>
  );
}

/** Адрес (slug): часть ссылки после nsbtea.ru/…, с примером и подсказкой из названия. */
export function SlugField({
  value,
  onChange,
  kind,
  title,
  error,
  locked,
  description,
  optional = true,
  label = "Адрес страницы",
  prefix: prefixOverride,
  example = { title: "Как заваривать пуэр", slug: "kak-zavarivat-puer" },
}: {
  value: string;
  onChange: (v: string) => void;
  kind?: PageKind;
  title: string;
  error?: string | null;
  locked?: boolean;
  description?: string;
  /** можно оставить пустым — сервер сделает адрес из названия */
  optional?: boolean;
  label?: string;
  prefix?: string;
  example?: { title: string; slug: string };
}) {
  const id = useId();
  const prefix = prefixOverride ?? pageKind(kind ?? "page").prefix;
  return (
    <Field
      id={id}
      label={label}
      error={error}
      description={description}
      hint={
        <>
          Часть ссылки латиницей через дефис. Например, для «{example.title}» — {example.slug}, и
          ссылка будет nsbtea.ru{prefix}
          {example.slug}.{optional ? " Можно не заполнять — адрес сделаем из названия." : ""} Если
          поменять адрес у того, что уже на сайте, старые ссылки перестанут открываться.
        </>
      }
    >
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-lg border bg-card",
          error && "border-destructive",
        )}
      >
        <span className="flex shrink-0 items-center border-r bg-muted px-3 font-mono text-sm text-muted-foreground">
          {prefix}
        </span>
        <Input
          id={id}
          value={value}
          disabled={locked}
          placeholder={slugify(title) || "adres-stranicy"}
          maxLength={80}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, description)}
          className="min-w-0 rounded-none border-0 font-mono shadow-none focus-visible:ring-0"
        />
      </div>
    </Field>
  );
}
