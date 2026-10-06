import type { Metadata } from "next";
import Link from "next/link";

import { ApplicationForm } from "@/components/shop/ApplicationForm";
import { Picture } from "@/components/shop/Picture";
import { RichText } from "@/components/shop/RichText";
import { formatDateTime } from "@/lib/format";
import { eventJsonLd, jsonLdString } from "@/lib/seo";
import { getEvent, PUBLIC_BASE_URL } from "@/lib/shop-server";

export async function generateMetadata(props: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const e = await getEvent(slug);
  const description = e.short_description ?? `${e.type_label}, ${formatDateTime(e.starts_at)}. ${e.place ?? ""}`;
  return {
    title: e.title,
    description,
    alternates: { canonical: `${PUBLIC_BASE_URL}/events/${e.slug}` },
    openGraph: {
      title: `${e.title} — ${e.day} ${e.month_label}`,
      description,
      images: [{ url: e.cover?.url ?? "/og-default.png" }],
    },
  };
}

export default async function EventPage(props: PageProps<"/events/[slug]">) {
  const { slug } = await props.params;
  const e = await getEvent(slug);
  return (
    <>
      <article className="container-site grid gap-x-[clamp(32px,5vw,72px)] gap-y-10 pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-7">
          <Link href="/events" className="text-sm text-muted hover:text-red">
            ← Все события
          </Link>
          <span className="kicker text-green">
            {e.type_label} · {e.day} {e.month_label}, {e.weekday}, {e.time}
          </span>
          <h1 className="font-serif text-[clamp(40px,6vw,88px)] leading-[0.98]">{e.title}</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-[17px]">
            {e.place ? (
              <>
                <dt className="text-muted">Где</dt>
                <dd>{e.place}</dd>
              </>
            ) : null}
            {e.duration_text ? (
              <>
                <dt className="text-muted">Сколько длится</dt>
                <dd>{e.duration_text}</dd>
              </>
            ) : null}
            {e.price_label ? (
              <>
                <dt className="text-muted">Стоимость</dt>
                <dd>{e.price_label}</dd>
              </>
            ) : null}
            {e.seats_label ? (
              <>
                <dt className="text-muted">Места</dt>
                <dd>{e.seats_label}</dd>
              </>
            ) : null}
          </dl>
          {e.short_description ? <p className="text-[17px] leading-[1.65] text-text2">{e.short_description}</p> : null}
          <RichText doc={e.description} />
        </div>
        <div className="flex flex-col gap-8">
          {e.cover ? (
            <div className="aspect-[4/5] overflow-hidden bg-photo">
              <Picture media={e.cover} alt={e.title} sizes="(max-width: 1024px) 100vw, 40vw" priority />
            </div>
          ) : null}
          <div id="zapis" className="scroll-mt-24 bg-block p-[clamp(20px,3vw,32px)]">
            {e.is_past ? (
              <p className="text-[17px] text-text2">Событие уже прошло. Следите за расписанием — скоро будут новые даты.</p>
            ) : e.can_book ? (
              <>
                <h2 className="mb-6 font-serif text-[28px]">Записаться</h2>
                <ApplicationForm type="event" eventId={e.id} maxGuests={e.seats_left ?? 10} priceLabel={e.price_label} />
              </>
            ) : (
              <p className="text-[17px] text-text2">Мест нет. Напишите нам в Telegram — добавим в лист ожидания.</p>
            )}
          </div>
        </div>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(eventJsonLd(e, PUBLIC_BASE_URL)) }} />
    </>
  );
}
