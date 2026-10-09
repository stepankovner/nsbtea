"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Percent, Plus, Settings, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import {
  discountText,
  moscowToday,
  periodText,
  promoCodeConditions,
  promoCodeStatus,
  PROMOTION_ORDER,
  promotionKeys,
  promotionsApi,
  promotionStatus,
  scopeText,
  thursdayPeriodText,
  usageText,
  type PromoCode,
  type Promotion,
  type ThursdayCalendar,
} from "@/lib/admin/promotions";
import { plural } from "@/lib/format";

import { ArchivedCodes, ArchivedPromotions, LIST_CLASS, ViewSwitch, type View } from "./ArchivedLists";
import { CopyButton, NoAccess } from "./fields";

export type ArchiveTab = "promotions" | "codes";

const settingsLink = "inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

function PromotionRow({ promotion }: { promotion: Promotion }) {
  const status = promotionStatus(promotion);
  return (
    <li className="border-b last:border-b-0">
      <Link href={`/admin/promotions/${promotion.id}`} className="flex flex-col gap-1.5 px-4 py-3.5 hover:bg-muted">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-medium break-words">{promotion.title}</span>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
          <span className="font-semibold text-red-700">{discountText(promotion.percent, promotion.amount_kop)}</span>
          {promotion.amount_kop !== null ? <span className="text-sm text-muted-foreground">за штуку или 100 г</span> : null}
          <span className="min-w-0 break-words">{scopeText(promotion.products, promotion.categories, "—")}</span>
        </span>
        <span className="text-sm text-muted-foreground">{periodText(promotion.starts_at, promotion.ends_at)}</span>
        <span className="text-sm text-muted-foreground">Применили: {usageText(promotion.stats)}</span>
      </Link>
    </li>
  );
}

function CodeRow({ code }: { code: PromoCode }) {
  const status = promoCodeStatus(code);
  const conditions = promoCodeConditions(code);
  return (
    <li className="flex items-stretch border-b last:border-b-0">
      <Link href={`/admin/promotions/codes/${code.id}`} className="flex min-w-0 flex-1 flex-col gap-1.5 py-3.5 pr-2 pl-4 hover:bg-muted">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-mono text-[17px] font-semibold tracking-wide break-all">{code.code}</span>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
          <span className="font-semibold text-red-700">{discountText(code.percent, code.amount_kop)}</span>
          <span className="min-w-0 break-words">{scopeText(code.products, code.categories)}</span>
        </span>
        {conditions.length ? <span className="text-sm">{conditions.join(" · ")}</span> : null}
        <span className="text-sm text-muted-foreground">{periodText(code.starts_at, code.ends_at)}</span>
        <span className="text-sm text-muted-foreground">Использовали: {usageText(code.stats)}</span>
        {code.description ? <span className="text-sm text-muted-foreground italic">{code.description}</span> : null}
      </Link>
      <span className="flex items-start pt-2.5 pr-2">
        <CopyButton text={code.code} iconOnly />
      </span>
    </li>
  );
}

function SalesList({ items }: { items: Promotion[] }) {
  return items.length ? (
    <ul className={LIST_CLASS}>
      {[...items]
        .sort((a, b) => (PROMOTION_ORDER[a.status_label] ?? 9) - (PROMOTION_ORDER[b.status_label] ?? 9))
        .map((p) => (
          <PromotionRow key={p.id} promotion={p} />
        ))}
    </ul>
  ) : (
    <EmptyState
      icon={Percent}
      title="Пока нет акций"
      action={
        <Button asChild variant="outline">
          <Link href="/admin/promotions/new">Создать акцию</Link>
        </Button>
      }
    >
      Например, «−15% на все улуны до конца месяца». Покупатели увидят старую и новую цену.
    </EmptyState>
  );
}

function CodesList({ items }: { items: PromoCode[] }) {
  return items.length ? (
    <ul className={LIST_CLASS}>
      {items.map((c) => (
        <CodeRow key={c.id} code={c} />
      ))}
    </ul>
  ) : (
    <EmptyState
      icon={TicketPercent}
      title="Пока нет промокодов"
      action={
        <Button asChild variant="outline">
          <Link href="/admin/promotions/codes/new">Создать промокод</Link>
        </Button>
      }
    >
      Промокод — слово, которое покупатель вводит в корзине, чтобы получить скидку. Например, CHAI10 для подписчиков Telegram.
    </EmptyState>
  );
}

function NearestThursday({ calendar }: { calendar: ThursdayCalendar }) {
  const first = calendar.upcoming[0];
  if (!first) return null;
  const planned = calendar.upcoming.filter((t) => t.planned).length;
  const isToday = first.date === moscowToday();
  const current = calendar.current;
  return (
    <div className="flex flex-col gap-2 text-[15px]">
      {current ? (
        // режим «неделя», пятница–среда: идёт скидка прошлого четверга
        <div className="flex flex-col gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-950">
          <p className="font-medium">Сейчас идёт — чай недели с четверга, {current.label}</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-red-700">−{current.percent}%</span>
            <span>{current.products.map((p) => p.name).join(", ")}</span>
          </p>
          <p className="text-sm">Скидка действует {thursdayPeriodText(current.date, calendar.mode)}</p>
        </div>
      ) : null}
      <p className="flex flex-wrap items-center gap-2 font-medium">
        {isToday ? "Сегодня" : "Ближайший"} — четверг, {first.label}
        {first.running ? <StatusBadge tone="success">Идёт сейчас</StatusBadge> : null}
      </p>
      {first.planned ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-red-700">−{first.percent}%</span>
            <span>{first.products.map((p) => p.name).join(", ")}</span>
          </p>
          <p className="text-sm text-muted-foreground">Скидка действует {thursdayPeriodText(first.date, calendar.mode)}</p>
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Не запланировано — в этот четверг акции не будет</p>
      )}
      <p className="text-sm text-muted-foreground">
        Запланировано {planned} из {calendar.upcoming.length} {plural(calendar.upcoming.length, "ближайшего четверга", "ближайших четвергов", "ближайших четвергов")}
      </p>
    </div>
  );
}

function Overview({ archive }: { archive: ArchiveTab | null }) {
  const { isOwner } = useAdmin();
  const [salesView, setSalesView] = useState<View>(archive === "promotions" ? "archive" : "active");
  const [codesView, setCodesView] = useState<View>(archive === "codes" ? "archive" : "active");
  const promotions = useQuery({ queryKey: promotionKeys.list, queryFn: () => promotionsApi.list() });
  const codes = useQuery({ queryKey: promotionKeys.codes, queryFn: () => promotionsApi.codes() });
  const welcome = useQuery({ queryKey: promotionKeys.welcome, queryFn: () => promotionsApi.welcomeStats() });
  const thursdays = useQuery({ queryKey: promotionKeys.thursdays, queryFn: () => promotionsApi.thursdays() });
  const loyalty = useQuery({ queryKey: promotionKeys.loyalty, queryFn: () => promotionsApi.loyaltySettings(), enabled: isOwner });

  return (
    <>
      <PageHeader
        title="Акции"
        description="Скидки на товары, промокоды, чай недели и скидка на первый заказ."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/admin/promotions/new">
                <Plus aria-hidden="true" />
                Новая акция
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/admin/promotions/codes/new">
                <Plus aria-hidden="true" />
                Новый промокод
              </Link>
            </Button>
          </>
        }
      />

      {/* на телефоне — одна колонка: сначала чай недели (о нём думаем каждую неделю), потом акции и промокоды */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Акции на товары" id="promo-sales" className="order-2 lg:order-none">
            <ViewSwitch value={salesView} onChange={setSalesView} label="Какие акции показать" />
            {salesView === "archive" ? (
              <ArchivedPromotions />
            ) : (
              <QueryState query={promotions}>
                {(items) => <SalesList items={items} />}
              </QueryState>
            )}
          </SectionCard>

          <SectionCard title="Промокоды" id="promo-codes" className="order-3 lg:order-none">
            <ViewSwitch value={codesView} onChange={setCodesView} label="Какие промокоды показать" />
            {codesView === "archive" ? (
              <ArchivedCodes />
            ) : (
              <QueryState query={codes}>
                {(items) => <CodesList items={items} />}
              </QueryState>
            )}
          </SectionCard>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Чай недели" id="promo-thursday" className="order-1 lg:order-none">
            <div className="flex flex-col gap-3">
              <QueryState query={thursdays} skeleton={1}>
                {(cal) => <NearestThursday calendar={cal} />}
              </QueryState>
              <Button asChild variant="outline" className="w-full sm:w-auto sm:self-start">
                <Link href="/admin/promotions/thursdays">
                  <CalendarDays aria-hidden="true" />
                  Календарь четвергов
                </Link>
              </Button>
              {isOwner ? (
                <Link href="/admin/settings/thursday" className={settingsLink}>
                  <Settings className="size-4" aria-hidden="true" />
                  Настройки чая недели: скидка и срок
                </Link>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Скидка на первый заказ" id="promo-welcome" className="order-4 lg:order-none">
            <div className="flex flex-col gap-2 text-[15px]">
              <p className="text-muted-foreground">
                Новый покупатель получает скидку на первый оплаченный заказ сам, без промокода. Об этом говорит баннер на сайте и в корзине.
              </p>
              {isOwner && loyalty.data ? (
                <p>
                  Сейчас:{" "}
                  <span className="font-medium">
                    {loyalty.data.welcome_enabled ? `${loyalty.data.welcome_percent}% на первый заказ` : "выключена"}
                  </span>
                </p>
              ) : null}
              <QueryState query={welcome} skeleton={1}>
                {(stats) => <p>Применили: {usageText(stats)}</p>}
              </QueryState>
              <p className="text-sm text-muted-foreground">С промокодом не суммируется — покупатель получит более выгодную скидку.</p>
            </div>
          </SectionCard>

          {isOwner ? (
            <SectionCard title="Баллы" id="promo-points" className="order-5 lg:order-none">
              <div className="flex flex-col gap-2 text-[15px]">
                {loyalty.data ? (
                  <p>
                    Начисляем {loyalty.data.earn_percent}% от оплаченной суммы, оплатить баллами можно до {loyalty.data.max_spend_percent}% стоимости
                    товаров.{" "}
                    {loyalty.data.points_ttl_days
                      ? `Баллы сгорают через ${loyalty.data.points_ttl_days} ${plural(loyalty.data.points_ttl_days, "день", "дня", "дней")}.`
                      : "Баллы не сгорают."}
                  </p>
                ) : (
                  <p className="text-muted-foreground">1 балл = 1 ₽. Баллы начисляются, когда заказ выполнен.</p>
                )}
                <Link href="/admin/settings/loyalty" className={settingsLink}>
                  <Settings className="size-4" aria-hidden="true" />
                  Настройки баллов и скидки на первый заказ
                </Link>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Как складываются скидки" id="promo-rules" className="order-6 lg:order-none">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-muted-foreground">
              <li>На один товар действует одна скидка — акция или чай недели, какая больше.</li>
              <li>Промокод и скидка на первый заказ не складываются — применяется более выгодная. На товары со скидкой они не действуют, если у промокода не отмечено «и на товары со скидкой».</li>
              <li>Баллами оплачивается то, что осталось после всех скидок.</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

/** Обзор раздела «Акции» (/admin/promotions); `archive` — сразу открыть архив акций или промокодов. */
export function PromotionsOverview({ archive = null }: { archive?: ArchiveTab | null }) {
  const { can } = useAdmin();
  if (!can("promotions")) return <NoAccess section="Акции" />;
  return <Overview archive={archive} />;
}
