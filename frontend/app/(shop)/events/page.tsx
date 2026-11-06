import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import copy from "@/content/events.json";
import { ApplicationForm } from "@/components/shop/ApplicationForm";
import { EventRow } from "@/components/shop/events/EventRow";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { PUBLIC_BASE_URL } from "@/lib/shop-server";

export const metadata: Metadata = {
  title: "Церемонии и сплавы",
  description: copy.seo,
  alternates: { canonical: `${PUBLIC_BASE_URL}/events` },
};

const FILTERS = [
  { value: undefined, label: "Все" },
  { value: "ceremony", label: "Церемонии" },
  { value: "rafting", label: "Сплавы" },
  { value: "other", label: "Другое" },
] as const;

const FORMATS = copy.formats;

export default async function EventsPage(props: PageProps<"/events">) {
  const search = await props.searchParams;
  const type = typeof search.type === "string" ? search.type : undefined;
  const past = search.period === "past";
  const events = await must(
    (await serverApi()).GET("/api/events", { params: { query: { type, period: past ? "past" : "upcoming" } } }),
  );

  return (
    <>
      <section className="container-site pb-[clamp(64px,8vw,112px)] pt-[clamp(40px,5vw,72px)]">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <h1 className="font-serif text-[clamp(52px,7vw,104px)] leading-[0.95]">
            Церемонии
            <br />и сплавы
          </h1>
          <p className="max-w-[440px] text-[17px] leading-[1.6] text-text2">
            {copy.intro}
          </p>
        </div>
        <div className="mb-[72px] grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-8">
          {FORMATS.map((f) => (
            <div key={f.title} className="flex flex-col gap-2.5 border-t border-ink pt-[18px]">
              <span className="font-serif text-[26px]">{f.title}</span>
              <span className="whitespace-pre-line text-[15px] leading-[1.55] text-text2">{f.text}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink py-3.5">
          <nav aria-label="Вид события" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = (type ?? undefined) === f.value;
              const query = new URLSearchParams();
              if (f.value) query.set("type", f.value);
              if (past) query.set("period", "past");
              return (
                <Link
                  key={f.label}
                  href={`/events${query.size ? `?${query}` : ""}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={clsx("px-3.5 py-2 text-[15px]", active ? "bg-ink text-paper" : "hover:bg-block")}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
          <Link href={past ? "/events" : "/events?period=past"} className="font-mono text-xs text-muted hover:text-red">
            {past ? "Ближайшие события →" : "Прошедшие события →"}
          </Link>
        </div>

        {events.length ? (
          events.map((event) => <EventRow key={event.id} event={event} />)
        ) : (
          <p className="border-t border-line py-10 text-[17px] text-text2">
            {past ? "Архив пока пуст." : copy.empty}
          </p>
        )}
      </section>

      <section id="vyezdnaya" className="scroll-mt-24 bg-forest text-paper">
        <div className="container-site flex flex-wrap gap-x-[clamp(32px,6vw,96px)] gap-y-12 py-[clamp(64px,8vw,120px)]">
          <div className="flex flex-[1_1_320px] flex-col gap-5">
            <span className="kicker text-green-light">На заказ</span>
            <h2 className="font-serif text-[clamp(40px,5vw,72px)] leading-none">Выездная церемония</h2>
            <p className="max-w-[420px] text-[17px] leading-[1.6] text-forest-muted">
              {copy.formats[2].text}
            </p>
          </div>
          <div className="max-w-[600px] flex-[1_1_400px]">
            <ApplicationForm type="private_ceremony" tone="dark" />
          </div>
        </div>
      </section>
    </>
  );
}
