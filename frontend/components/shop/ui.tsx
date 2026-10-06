/** Базовые элементы витрины по макету: кнопки, поля, степпер, цена. */
import clsx from "clsx";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { formatRub } from "@/lib/format";

export type ButtonVariant = "primary" | "outline" | "pill" | "pill-outline" | "light" | "link";

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-red text-paper px-[26px] py-4 text-base font-medium hover:bg-red-hover disabled:opacity-50 disabled:hover:bg-red",
  outline:
    "border border-ink text-ink px-[25px] py-[15px] text-base font-medium hover:bg-ink hover:text-paper",
  pill: "rounded-full bg-ink text-paper px-7 py-[17px] text-base font-medium hover:bg-red disabled:opacity-40 disabled:hover:bg-ink",
  "pill-outline":
    "rounded-full border border-ink text-ink px-[18px] py-2.5 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink",
  light: "bg-paper text-ink px-[26px] py-4 text-base font-medium hover:bg-white",
  link: "text-red hover:text-green p-0",
};

export function buttonClass(variant: ButtonVariant = "primary", extra?: string): string {
  return clsx(
    "inline-flex items-center justify-center gap-2 transition-colors duration-150 font-sans",
    BUTTON[variant],
    extra,
  );
}

interface FieldShellProps {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldShell({ label, error, hint, tone = "light", className, children }: FieldShellProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={clsx("label-mono", tone === "dark" ? "text-green-light" : "text-muted")}>
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error ? (
        <span id={hintId} className={clsx("text-[13px]", tone === "dark" ? "text-forest-muted" : "text-muted")}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={clsx("text-[13px]", tone === "dark" ? "text-red-light" : "text-red")}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

const inputClass = (tone: "light" | "dark", invalid: boolean) =>
  clsx(
    "w-full bg-transparent border-0 border-b py-2.5 text-base outline-none rounded-none",
    tone === "dark" ? "border-paper text-paper" : "border-ink text-ink",
    invalid && (tone === "dark" ? "border-red-light" : "border-red"),
  );

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  tone?: "light" | "dark";
  wrapperClassName?: string;
};

export function TextField({ label, error, hint, tone = "light", wrapperClassName, className, ...rest }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} tone={tone} className={wrapperClassName}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(inputClass(tone, Boolean(error)), className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  error?: string | null;
  tone?: "light" | "dark";
  wrapperClassName?: string;
};

export function TextAreaField({ label, error, tone = "light", wrapperClassName, className, ...rest }: TextAreaProps) {
  return (
    <FieldShell label={label} error={error} tone={tone} className={wrapperClassName}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(inputClass(tone, Boolean(error)), "resize-y", className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

interface StepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel?: string;
  increaseLabel?: string;
  shape?: "pill" | "square";
  size?: "md" | "sm";
  disabled?: boolean;
  testId?: string;
}

export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  decreaseLabel = "Меньше",
  increaseLabel = "Больше",
  shape = "pill",
  size = "md",
  disabled = false,
  testId,
}: StepperProps) {
  const button = clsx(
    "flex items-center justify-center text-xl text-ink disabled:opacity-30",
    size === "md" ? "w-11 h-[46px]" : "w-10 h-10",
  );
  return (
    <div
      className={clsx("inline-flex items-center border border-ink", shape === "pill" && "rounded-full")}
      role="group"
      aria-label="Количество"
    >
      <button
        type="button"
        className={button}
        aria-label={decreaseLabel}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="w-7 text-center tabular-nums" data-testid={testId} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={button}
        aria-label={increaseLabel}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

export function Price({
  kop,
  oldKop,
  className,
  oldClassName,
}: {
  kop: number;
  oldKop?: number | null;
  className?: string;
  oldClassName?: string;
}) {
  return (
    <>
      <span className={clsx(oldKop ? "text-red" : undefined, className)}>{formatRub(kop)}</span>
      {oldKop ? (
        <>
          <span className="sr-only">Без скидки:</span>
          <s className={clsx("font-normal text-muted", oldClassName)}>{formatRub(oldKop)}</s>
        </>
      ) : null}
    </>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("kicker text-green", className)}>{children}</span>;
}
