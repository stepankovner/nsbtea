import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import { ApplicationForm } from "@/components/shop/ApplicationForm";
import { EventRow } from "@/components/shop/events/EventRow";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { PUBLIC_BASE_URL } from "@/lib/shop-server";

export const metadata: Metadata = {
  title: "Церемонии и сплавы",
  description: "Чайные церемонии во Владимире, сплавы на сапах по Клязьме и выездные церемонии на заказ.",
  alternates: { canonical: `${PUBLIC_BASE_URL}/events` },
};

const FILTERS = [
  { value: undefined, label: "Все" },
  { value: "ceremony", label: "Церемонии" },
  { value: "rafting", label: "Сплавы" },
  { value: "lecture", label: "Лекции" },
] as const;

const FORMATS = [
  { title: "Чайная церемония", text: "Два часа, три-четыре чая одной темы, до восьми гостей." },
  { title: "Сплав на сапах", text: "Около четырёх часов по Клязьме. Сапы и инструктор включены, чай заваривается на берегу." },
  { title: "Выездная церемония", text: "Привезём чай, посуду и мастера: домой, в офис, на праздник или на природу." },
];

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
            Вечерние церемонии проходят во Владимире, сплавы — по Клязьме, с церемонией на берегу. Выездную церемонию можно
            заказать на любую дату.
          </p>
        </div>
        <div className="mb-[72px] grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-8">
          {FORMATS.map((f) => (
            <div key={f.title} className="flex flex-col gap-2.5 border-t border-ink pt-[18px]">
              <span className="font-serif text-[26px]">{f.title}</span>
              <span className="text-[15px] leading-[1.55] text-text2">{f.text}</span>
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
            {past ? "Архив пока пуст." : "Ближайших событий пока нет — расписание появится здесь и в нашем Telegram-канале."}
          </p>
        )}
      </section>

      <section id="vyezdnaya" className="scroll-mt-24 bg-forest text-paper">
        <div className="container-site flex flex-wrap gap-x-[clamp(32px,6vw,96px)] gap-y-12 py-[clamp(64px,8vw,120px)]">
          <div className="flex flex-[1_1_320px] flex-col gap-5">
            <span className="kicker text-green-light">На заказ</span>
            <h2 className="font-serif text-[clamp(40px,5vw,72px)] leading-none">Выездная церемония</h2>
            <p className="max-w-[420px] text-[17px] leading-[1.6] text-forest-muted">
              Расскажите, где и когда. Перезвоним, предложим чаи и рассчитаем стоимость.
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
