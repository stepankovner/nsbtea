import type { ReactNode } from "react";

import type { Schemas } from "@/lib/api/client";
import { formatRub } from "@/lib/format";

/**
 * Сведения для покупателя, которые банк проверяет перед подключением эквайринга:
 * реквизиты, способы и стоимость доставки, способы оплаты. Берутся из настроек магазина,
 * поэтому всегда совпадают с тем, что покупатель увидит при оформлении.
 */

type Site = Schemas["SiteOut"];

export const CARDS_TEXT = "карты МИР, Visa, Mastercard российских банков или СБП";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-ink pt-5">
      <h2 id={id} className="label-mono text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[17px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ContactsDetails({ site }: { site: Site }) {
  const s = site.store;
  const contacts = (
    [
      ["Телефон", s.phone],
      ["Почта", s.email],
      ["Адрес", s.address],
      ["Часы работы", s.work_hours],
    ] as [string, string][]
  ).filter(([, v]) => v) as [string, ReactNode][];
  if (s.telegram_url) {
    contacts.push([
      "Telegram",
      <a key="tg" href={s.telegram_url} target="_blank" rel="noopener noreferrer" className="text-red underline">
        Написать
      </a>,
    ]);
  }
  const requisites = (
    [
      ["Продавец", s.legal_name],
      ["ИНН", s.inn],
      ["ОГРНИП", s.ogrnip],
      ["Юридический адрес", s.legal_address],
    ] as [string, string][]
  ).filter(([, v]) => v);
  return (
    <div className="flex flex-col gap-8">
      <Rows rows={contacts} />
      {requisites.length ? (
        <Section id="buyer-requisites" title="Реквизиты">
          <Rows rows={requisites} />
        </Section>
      ) : null}
    </div>
  );
}

interface Way {
  title: string;
  text: string;
}

function deliveryWays(site: Site): Way[] {
  const d = site.delivery;
  const ways: Way[] = [];
  if (d.pickup_enabled) {
    ways.push({ title: "Самовывоз во Владимире", text: ["Бесплатно", d.pickup_address].filter(Boolean).join(". ") });
  }
  if (d.courier_enabled) {
    const price =
      d.courier_price_kop > 0
        ? `${formatRub(d.courier_price_kop)}${d.courier_free_from_kop ? `, бесплатно от ${formatRub(d.courier_free_from_kop)}` : ""}`
        : "Бесплатно";
    ways.push({ title: "Курьер по Владимиру", text: [price, d.courier_note].filter(Boolean).join(". ") });
  }
  if (d.cdek_enabled) {
    const free = d.cdek_free_from_kop ? ` Бесплатно от ${formatRub(d.cdek_free_from_kop)}.` : "";
    ways.push({
      title: "СДЭК — по всей России",
      text: `До пункта выдачи или до двери. Стоимость и срок — при оформлении, по тарифу СДЭК.${free}`,
    });
  }
  return ways;
}

function Ways({ ways }: { ways: Way[] }) {
  return (
    <ul className="flex flex-col gap-3 text-[17px]">
      {ways.map((w) => (
        <li key={w.title} className="flex flex-col">
          <span>{w.title}</span>
          <span className="text-[15px] text-muted">{w.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function DeliveryPaymentDetails({ site }: { site: Site }) {
  const payment: Way[] = [];
  if (site.online_payment_available) {
    payment.push({
      title: "Онлайн при оформлении заказа",
      text: `На защищённой странице банка «Точка»: ${CARDS_TEXT}. Электронный чек придёт на почту.`,
    });
  } else {
    payment.push({
      title: "Онлайн-оплата подключается",
      text: "Скоро можно будет оплатить заказ картой или через СБП прямо на сайте.",
    });
  }
  if (site.allow_pay_on_delivery) {
    payment.push({ title: "При получении", text: "Для самовывоза и курьера по Владимиру." });
  }
  return (
    <div className="flex flex-col gap-8">
      <Section id="buyer-delivery" title="Способы доставки">
        <Ways ways={deliveryWays(site)} />
      </Section>
      <Section id="buyer-payment" title="Оплата">
        <Ways ways={payment} />
      </Section>
    </div>
  );
}
