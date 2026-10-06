import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { Hint } from "./Hint";

/** Поле формы: подпись, «?» с примером, пояснение под полем и понятная ошибка. */
export function Field({
  id,
  label,
  hint,
  description,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  description?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex min-h-7 items-center gap-1">
        <Label htmlFor={id} className="text-[15px] font-medium">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {hint ? <Hint label={label}>{hint}</Hint> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : description ? (
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string | null, description?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (description) return `${id}-description`;
  return undefined;
}
