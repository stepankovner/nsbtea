/** Блоки главной (редактируются в админке: «Ещё → Главная страница»). */
import Link from "next/link";

import { ApplicationForm } from "@/components/shop/ApplicationForm";
import { AddToCartButton } from "@/components/shop/AddToCartButton";
import { Picture } from "@/components/shop/Picture";
import { TeaCard } from "@/components/shop/TeaCard";
import { badgeColors, tileColors } from "@/components/shop/tile";
import { buttonClass } from "@/components/shop/ui";
import type { Schemas } from "@/lib/api/client";
import { formatGrams, formatRub } from "@/lib/format";

type Block = Schemas["HomeBlockOut"];

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const image = (block: Block, key: string) => {
  const id = block.data[key];
  return typeof id === "string" ? (block.images[id] ?? null) : null;
};

export function HeroBlock({ block }: { block: Block }) {
  const d = block.data;
  return (
    <>
      <section className="container-site pt-[clamp(40px,6vw,96px)]">
        <div className="kicker mb-7 flex flex-wrap justify-between gap-x-6 gap-y-3 text-green">
          <span>{str(d.kicker_left)}</span>
          <span>{str(d.kicker_right)}</span>
        </div>
        <h1 className="font-serif text-[clamp(52px,9vw,148px)] font-normal leading-[0.95] tracking-[-0.025em]">
          <span className="block">{str(d.title_line1)}</span>
          <span className="block pl-[clamp(0px,16vw,240px)]">{str(d.title_line2)}</span>
        </h1>
      </section>
      <section className="container-site flex flex-wrap items-end gap-x-[clamp(32px,5vw,72px)] gap-y-12 pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)]">
        <div className="flex max-w-[420px] flex-[1_1_300px] flex-col gap-8">
          <p className="text-lg leading-[1.6] text-text2 [text-wrap:pretty]">{str(d.text)}</p>
          <div className="flex flex-wrap gap-3">
            {d.primary_label ? (
              <Link href={str(d.primary_href, "/catalog")} className={buttonClass("primary")}>
                {str(d.primary_label)}
              </Link>
            ) : null}
            {d.secondary_label ? (
              <Link href={str(d.secondary_href, "/events")} className={buttonClass("outline")}>
                {str(d.secondary_label)}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="relative flex-[2_1_480px]">
          <div className="aspect-[16/10] overflow-hidden">
            <Picture
              media={image(block, "image_media_id")}
              alt={str(d.image_caption, "Чайная церемония").replace(/^фото:\s*/, "")}
              placeholder={str(d.image_caption, "фото")}
              sizes="(max-width: 900px) 100vw, 60vw"
              priority
            />
          </div>
          <div className="absolute -top-[26px] right-[clamp(16px,3vw,40px)] bg-red px-3 py-4 font-hanzi text-[30px] leading-none text-paper" aria-hidden="true">
            茶
          </div>
        </div>
      </section>
    </>
  );
}

function BrewStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-serif text-[clamp(30px,3.2vw,48px)] leading-none">{value}</span>
      <span className="font-mono text-xs text-muted">{label}</span>
    </div>
  );
}

export function ThursdayBlock({ block }: { block: Block }) {
  if (!block.products.length || !block.thursday) return null;
  const t = block.thursday;
  return (
    <section id="chai-nedeli" className="container-site scroll-mt-24 pb-[clamp(80px,9vw,140px)]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
        <div className="flex flex-col gap-3.5">
          <span className="kicker text-red">
            Чай недели · до {t.ends_on_label}
          </span>
          <h2 className="font-serif text-[clamp(40px,5vw,72px)] leading-none">
            {str(block.data.title, "Чай недели")} {t.percent}%
          </h2>
        </div>
        {block.data.note ? <p className="max-w-[420px] text-base leading-[1.6] text-text2">{str(block.data.note)}</p> : null}
      </div>
      <div className="flex flex-col gap-4">
        {block.products.map((p, index) => {
          const colors = tileColors(p.tile_color);
          const badge = badgeColors(p.tile_color);
          const href = `/product/${p.slug}`;
          return (
            <article key={p.id} className={`flex flex-wrap bg-block ${index % 2 ? "flex-row-reverse" : ""}`}>
              <Link
                href={href}
                aria-label={p.name}
                className="relative min-h-[clamp(320px,38vw,500px)] flex-[1_1_360px] overflow-hidden"
                style={{ background: colors.bg, color: colors.fg }}
              >
                {p.image ? (
                  <div className="absolute inset-y-0 left-0 right-[30%]">
                    <Picture media={p.image} alt={p.name} sizes="(max-width: 900px) 70vw, 30vw" />
                  </div>
                ) : null}
                {p.hanzi ? (
                  <span lang="zh-Hans" className="hanzi-vertical absolute right-[clamp(28px,4.4vw,64px)] top-[clamp(28px,3.4vw,48px)] text-[clamp(60px,7vw,108px)]">
                    {p.hanzi}
                  </span>
                ) : null}
                <span
                  className="absolute left-[clamp(20px,3.4vw,48px)] top-[clamp(24px,3vw,40px)] rounded-full px-3 py-1.5 font-mono text-[13px] font-medium"
                  style={{ background: badge.bg, color: badge.fg }}
                >
                  −{t.percent}%
                </span>
                {p.pinyin ? (
                  <span className="absolute bottom-[clamp(20px,3vw,36px)] left-[clamp(20px,3.4vw,48px)] font-mono text-[13px]">
                    {p.pinyin}
                  </span>
                ) : null}
              </Link>
              <div className="flex flex-[1.3_1_420px] flex-col justify-between gap-9 p-[clamp(28px,4vw,64px)]">
                <div className="flex flex-col gap-4">
                  {p.meta ? <span className="kicker text-green">{p.meta}</span> : null}
                  <h3 className="font-serif text-[clamp(36px,4vw,60px)] leading-[1.04]">
                    <Link href={href} className="hover:text-red">
                      {p.name}
                    </Link>
                  </h3>
                  {p.short_description ? (
                    <p className="max-w-[560px] text-[17px] leading-[1.6] text-text2 [text-wrap:pretty]">{p.short_description}</p>
                  ) : null}
                </div>
                {p.brewing_summary ? (
                  <div className="grid grid-cols-3 gap-4 border-t border-ink pt-6">
                    <BrewStat value={p.brewing_summary.temp} label="вода" />
                    <BrewStat value={p.brewing_summary.grams} label="на 100 мл" />
                    <BrewStat value={p.brewing_summary.steeps} label={p.brewing_summary.steeps_label} />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
                  <span className="flex items-baseline gap-2.5 whitespace-nowrap">
                    <span className="text-2xl font-medium text-red">{formatRub(p.price_kop)}</span>
                    {p.old_price_kop ? <s className="text-base text-muted">{formatRub(p.old_price_kop)}</s> : null}
                    {p.price_grams ? <span className="text-base text-muted">/ {formatGrams(p.price_grams)}</span> : null}
                  </span>
                  <AddToCartButton product={p} className={buttonClass("pill")} />
                  <Link href={href} className="text-base text-red hover:text-green">
                    Подробнее →
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const CHIP: Record<string, string> = { ink: "#1D231B", green: "#546B49", red: "#8E3236" };

export function ServicesBlock({ block }: { block: Block }) {
  const items = Array.isArray(block.data.items) ? (block.data.items as Record<string, unknown>[]) : [];
  if (!items.length) return null;
  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)]">
      <h2 className="mb-8 font-serif text-[clamp(32px,3.6vw,48px)]">{str(block.data.title, "Не только чай")}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-x-6 gap-y-10">
        {items.map((item, index) => {
          const id = item.image_media_id;
          const media = typeof id === "string" ? (block.images[id] ?? null) : null;
          return (
            <div key={index} className="flex flex-col gap-[18px]">
              <div className="relative aspect-[4/5] overflow-hidden bg-photo">
                <Picture media={media} alt={str(item.title)} placeholder={`фото: ${str(item.title).toLowerCase()}`} sizes="(max-width: 900px) 100vw, 33vw" />
                {item.kicker ? (
                  <span
                    className="pointer-events-none absolute left-4 top-4 rounded-full px-[11px] py-[5px] font-mono text-[11px] tracking-[0.06em] text-paper"
                    style={{ background: CHIP[str(item.chip_color)] ?? CHIP.ink }}
                  >
                    {str(item.kicker)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="font-serif text-[clamp(26px,2.4vw,32px)] leading-[1.1]">{str(item.title)}</span>
                <span className="text-base leading-[1.55] text-text2">{str(item.text)}</span>
              </div>
              {item.cta_label ? (
                <Link href={str(item.cta_href, "/events")} className={buttonClass("pill-outline", "self-start")}>
                  {str(item.cta_label)}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ProductsBlock({ block, moreHref = "/catalog" }: { block: Block; moreHref?: string }) {
  if (!block.products.length) return null;
  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)]">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-serif text-[clamp(32px,3.6vw,48px)]">{str(block.data.title, "Сейчас в наличии")}</h2>
        <Link href={moreHref} className="text-[15px] text-red hover:text-green">
          Весь каталог →
        </Link>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-x-6 gap-y-12">
        {block.products.map((p) => (
          <TeaCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

export function EventsBlock({ block }: { block: Block }) {
  if (!block.events.length) return null;
  return (
    <section className="bg-forest text-paper">
      <div className="container-site flex flex-wrap gap-x-[clamp(32px,6vw,96px)] gap-y-12 py-[clamp(64px,8vw,120px)]">
        <div className="flex max-w-[360px] flex-[1_1_280px] flex-col gap-6">
          <span className="kicker text-green-light">{str(block.data.kicker, "Расписание")}</span>
          <h2 className="font-serif text-[clamp(36px,4vw,56px)] leading-[1.05]">
            {str(block.data.title, "Ближайшие церемонии и сплавы")}
          </h2>
          <Link href="/events" className="self-start border-b border-paper text-[15px] hover:text-green-light">
            Все даты
          </Link>
        </div>
        <div className="flex-[2_1_520px]">
          {block.events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-forest-line py-6">
              <div className="flex w-[150px] items-baseline gap-3">
                <span className="font-serif text-[56px] leading-none">{e.day}</span>
                <span className="font-mono text-xs leading-normal text-forest-muted">
                  {e.month_label}
                  <br />
                  {e.weekday}, {e.time}
                </span>
              </div>
              <div className="flex flex-[1_1_240px] flex-col gap-1.5">
                <span className="label-mono text-green-light">{e.type_label}</span>
                <Link href={`/events/${e.slug}`} className="font-serif text-2xl leading-[1.2] hover:text-green-light">
                  {e.title}
                </Link>
              </div>
              {e.price_label ? <span className="whitespace-nowrap text-[15px]">{e.price_label}</span> : null}
              {e.can_book ? (
                <Link href={`/events/${e.slug}#zapis`} className="bg-paper px-[18px] py-[11px] text-sm font-medium text-ink hover:bg-white">
                  Записаться
                </Link>
              ) : (
                <span className="text-sm text-forest-muted">{e.seats_label ?? "Мест нет"}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AboutBlock({ block }: { block: Block }) {
  const d = block.data;
  return (
    <section id="o-magazine" className="container-site flex scroll-mt-24 flex-wrap items-center gap-x-[clamp(32px,6vw,96px)] gap-y-12 py-[clamp(80px,9vw,140px)]">
      <div className="aspect-[4/5] max-w-[460px] flex-[1_1_320px] overflow-hidden">
        <Picture media={image(block, "image_media_id")} alt="Никита Булич" placeholder={str(d.image_caption, "фото")} sizes="(max-width: 900px) 100vw, 40vw" />
      </div>
      <div className="flex max-w-[600px] flex-[1_1_360px] flex-col gap-7">
        <span className="kicker text-green">{str(d.kicker, "О магазине")}</span>
        <p className="font-serif text-[clamp(28px,3vw,42px)] leading-[1.2] [text-wrap:pretty]">{str(d.title)}</p>
        <p className="text-[17px] leading-[1.65] text-text2 [text-wrap:pretty]">{str(d.text)}</p>
        <Link href="/about" className="self-start text-[15px] text-red hover:text-green">
          Подробнее о магазине →
        </Link>
      </div>
    </section>
  );
}

export function AdvantagesBlock({ block }: { block: Block }) {
  const items = Array.isArray(block.data.items) ? (block.data.items as Record<string, unknown>[]) : [];
  if (!items.length) return null;
  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)]">
      <h2 className="mb-8 font-serif text-[clamp(32px,3.6vw,48px)]">{str(block.data.title)}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-8">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2.5 border-t border-ink pt-[18px]">
            <span className="font-serif text-[26px]">{str(item.title)}</span>
            <span className="text-[15px] leading-[1.55] text-text2">{str(item.text)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WholesaleBlock({ block }: { block: Block }) {
  return (
    <section id="opt" className="scroll-mt-24 border-t border-line bg-block">
      <div className="container-site flex flex-wrap gap-x-[clamp(32px,6vw,96px)] gap-y-12 py-[clamp(64px,8vw,120px)]">
        <div className="flex flex-[1_1_320px] flex-col gap-5">
          <h2 className="font-serif text-[clamp(48px,6vw,88px)] leading-none">{str(block.data.title, "Оптовые заказы")}</h2>
          <p className="max-w-[440px] text-[17px] leading-[1.6] text-text2">{str(block.data.text)}</p>
        </div>
        <div className="max-w-[560px] flex-[1_1_380px]">
          <ApplicationForm type="wholesale" />
        </div>
      </div>
    </section>
  );
}
