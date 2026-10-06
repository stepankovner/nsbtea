"use client";

import { useId, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { kopToRubInput, rubToKop } from "@/lib/format";

import { describedBy, Field } from "./Field";

const MONEY_ERROR = "Введите сумму в рублях, например 1200 или 1200,50";

/** Сумма вводится в рублях, хранится в копейках (правило 1). */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  description,
  error,
  required,
  suffix = "₽",
  className,
}: {
  label: string;
  value: number | null;
  onChange: (kop: number | null) => void;
  hint?: ReactNode;
  description?: ReactNode;
  error?: string | null;
  required?: boolean;
  suffix?: string;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(kopToRubInput(value));
  const [local, setLocal] = useState<string | null>(null);
  const [synced, setSynced] = useState(value);

  // значение поменялось снаружи (загрузили товар) — показываем его
  if (value !== synced) {
    setSynced(value);
    setText(kopToRubInput(value));
  }

  function commit() {
    if (!text.trim()) {
      setLocal(null);
      setSynced(null);
      onChange(null);
      return;
    }
    const kop = rubToKop(text);
    if (kop === null) {
      setLocal(MONEY_ERROR);
      return;
    }
    setLocal(null);
    setSynced(kop);
    setText(kopToRubInput(kop));
    onChange(kop);
  }

  const shown = local ?? error ?? null;
  return (
    <Field id={id} label={label} hint={hint} description={description} error={shown} required={required} className={className}>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          aria-invalid={shown ? true : undefined}
          aria-describedby={describedBy(id, shown, description)}
          className="pr-10 text-right tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">{suffix}</span>
      </div>
    </Field>
  );
}
