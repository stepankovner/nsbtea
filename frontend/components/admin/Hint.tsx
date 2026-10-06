"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** «?» у поля: открывается нажатием (на телефоне наведения нет), внутри — пояснение с примером. */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Подсказка: ${label}`}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CircleHelp className="size-[18px]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[300px] text-sm leading-relaxed" side="top" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}
