"use client";

/** Поля, которых нет среди общих: выпадающий список, число (граммы, годы), список слов-«фишек». */
import { Plus, X } from "lucide-react";
import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";

import { describedBy, Field } from "@/components/admin/Field";
import { Hint } from "@/components/admin/Hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Обычный выпадающий список браузера — на телефоне открывает удобное системное меню. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

function toText(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

function parse(text: string, decimal: boolean): number | null | "invalid" {
  const cleaned = text.replace(/[\s ]/g, "");
  if (!cleaned) return null;
  if (decimal ? !/^\d+([.,]\d*)?$/.test(cleaned) : !/^\d+$/.test(cleaned)) return "invalid";
  return Number(cleaned.replace(",", "."));
}

/** Целое число (граммы, штуки, годы) или, с `decimal`, дробное — например 7,5 г заварки. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  description,
  error,
  required,
  suffix,
  placeholder,
  decimal = false,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: ReactNode;
  description?: ReactNode;
  error?: string | null;
  required?: boolean;
  suffix?: string;
  placeholder?: string;
  decimal?: boolean;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(toText(value));
  const [synced, setSynced] = useState(value);
  const [local, setLocal] = useState<string | null>(null);

  // значение поменялось снаружи — показываем его
  if (value !== synced) {
    setSynced(value);
    setText(toText(value));
    setLocal(null);
  }

  function change(next: string) {
    setText(next);
    const parsed = parse(next, decimal);
    if (parsed === "invalid") {
      setLocal(decimal ? "Введите число, например 7 или 7,5" : "Введите целое число, например 50");
      return;
    }
    setLocal(null);
    setSynced(parsed);
    onChange(parsed);
  }

  const shown = local ?? error ?? null;
  return (
    <Field id={id} label={label} hint={hint} description={description} error={shown} required={required} className={className}>
      <div className="relative">
        <Input
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          aria-invalid={shown ? true : undefined}
          aria-describedby={describedBy(id, shown, description)}
          className={cn("tabular-nums", suffix && "pr-12")}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </Field>
  );
}

/** Список коротких слов: вкусовые ноты, другие названия для поиска. */
export function ChipsInput({
  label,
  value,
  onChange,
  hint,
  placeholder,
  suggestions = [],
  onQuery,
  max = 20,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: ReactNode;
  placeholder?: string;
  suggestions?: string[];
  onQuery?: (q: string) => void;
  max?: number;
}) {
  const id = useId();
  const listId = useId();
  const [text, setText] = useState("");

  function add(raw: string) {
    const items = raw
      .split(",")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const next = [...value];
    for (const item of items) {
      if (next.length >= max) break;
      if (!next.some((v) => v.toLowerCase() === item.toLowerCase())) next.push(item.slice(0, 60));
    }
    if (next.length !== value.length) onChange(next);
    setText("");
    onQuery?.("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (text.trim()) add(text);
    }
  }

  const options = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center gap-1">
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        {hint ? <Hint label={label}>{hint}</Hint> : null}
      </div>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label}: добавлено`}>
          {value.map((item) => (
            <li key={item} className="flex items-center gap-1 rounded-full border bg-muted/60 py-1 pl-3 pr-1 text-[15px]">
              {item}
              <button
                type="button"
                aria-label={`Убрать: ${item}`}
                onClick={() => onChange(value.filter((v) => v !== item))}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          list={options.length ? listId : undefined}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            onQuery?.(e.target.value.trim());
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (text.trim()) add(text);
          }}
          disabled={value.length >= max}
        />
        <Button type="button" variant="outline" onClick={() => add(text)} disabled={!text.trim()} aria-label={`Добавить: ${label}`}>
          <Plus aria-hidden="true" />
          <span className="hidden sm:inline">Добавить</span>
        </Button>
      </div>
      {options.length ? (
        <datalist id={listId}>
          {options.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
      <p className="text-sm text-muted-foreground">Впишите слово и нажмите «Добавить» или Enter. Можно несколько через запятую.</p>
    </div>
  );
}
