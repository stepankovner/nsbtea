"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";

import { ApplicationForm } from "@/components/shop/ApplicationForm";
import type { Schemas } from "@/lib/api/client";

/** Строка события со встроенной формой записи (раскрывается по кнопке, без всплывающих окон). */
export function EventRow({ event }: { event: Schemas["EventOut"] }) {
  const [open, setOpen] = useState(false);
  const formId = `zapis-${event.slug}`;
  const soldOut = !event.can_book && !event.is_past;
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 py-7">
        <div className="flex w-[160px] items-baseline gap-3">
          <span className="font-serif text-[64px] leading-none">{event.day}</span>
          <span className="font-mono text-xs leading-normal text-muted">
            {event.month_label}
            <br />
            {event.weekday}, {event.time}
          </span>
        </div>
        <div className="flex flex-[1_1_300px] flex-col gap-2">
          <span className="label-mono flex flex-wrap gap-3">
            <span className="text-green">{event.type_label}</span>
            {event.note ? <span className="text-red">{event.note}</span> : null}
          </span>
          <Link href={`/events/${event.slug}`} className="font-serif text-[clamp(24px,2.4vw,30px)] leading-[1.2] hover:text-red">
            {event.title}
          </Link>
          <span className="text-sm text-muted">
            {[event.place, event.duration_text].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="flex min-w-[130px] flex-col gap-1">
          {event.price_label ? <span className="text-[17px] font-medium">{event.price_label}</span> : null}
          {event.seats_label ? (
            <span className={clsx("text-[13px]", event.seats_left === 0 ? "text-muted" : "text-green")}>{event.seats_label}</span>
          ) : null}
        </div>
        {event.can_book ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={formId}
            onClick={() => setOpen((v) => !v)}
            className={clsx(
              "min-w-[150px] border border-ink px-[18px] py-3 text-[15px] font-medium transition-colors",
              open ? "bg-ink text-paper" : "bg-transparent text-ink hover:bg-ink hover:text-paper",
            )}
          >
            {open ? "Свернуть" : "Записаться"}
          </button>
        ) : soldOut ? (
          <span className="min-w-[150px] text-[15px] text-muted">Мест нет — напишите в Telegram</span>
        ) : null}
      </div>
      {open ? (
        <div id={formId} className="mb-7 bg-block p-[clamp(20px,3vw,28px)]">
          <ApplicationForm type="event" eventId={event.id} maxGuests={event.seats_left ?? 10} priceLabel={event.price_label} />
        </div>
      ) : null}
    </div>
  );
}
