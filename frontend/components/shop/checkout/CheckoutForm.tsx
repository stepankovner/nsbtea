"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { Schemas } from "@/lib/api/client";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import { formatPhone, formatRub } from "@/lib/format";
import { ecommerce } from "@/lib/metrika";
import { shopApi, type DeliveryIn, type Pvz } from "@/lib/shop-api";
import { normalizePhone, validateCheckout, type DeliveryMethod, type FormErrors } from "@/lib/validation";

import { useCart } from "../cart-context";
import { buttonClass, TextAreaField, TextField } from "../ui";
import { CityPicker, type City } from "./CityPicker";
import { PvzPicker } from "./PvzPicker";

type Site = Schemas["SiteOut"];
type Quote = Schemas["QuoteOut"];

interface Customer {
  name: string;
  phone: string;
  email: string;
}

interface Option {
  method: DeliveryMethod;
  label: string;
  note: string;
}

function deliveryOptions(site: Site): Option[] {
  const d = site.delivery;
  const options: Option[] = [];
  if (d.pickup_enabled) {
    options.push({ method: "pickup", label: "Самовывоз во Владимире", note: d.pickup_address || "Бесплатно" });
  }
  if (d.courier_enabled) {
    const price =
      d.courier_price_kop > 0
        ? `${formatRub(d.courier_price_kop)}${d.courier_free_from_kop ? `, бесплатно от ${formatRub(d.courier_free_from_kop)}` : ""}`
        : "Бесплатно";
    options.push({ method: "courier", label: "Курьер по Владимиру", note: [price, d.courier_note].filter(Boolean).join(" · ") });
  }
  if (d.cdek_enabled) {
    const free = d.cdek_free_from_kop ? ` Бесплатно от ${formatRub(d.cdek_free_from_kop)}.` : "";
    options.push({ method: "cdek_pvz", label: "СДЭК — пункт выдачи", note: `По всей России. Стоимость — после выбора пункта.${free}` });
    options.push({ method: "cdek_door", label: "СДЭК — до двери", note: `СДЭК привезёт заказ по вашему адресу.${free}` });
  }
  return options;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as T;
}

function ChoiceButton({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-3.5 border px-4 py-3.5 text-left text-ink",
        checked ? "border-ink bg-paper" : "border-line hover:border-ink",
      )}
    >
      <span className={clsx("mt-1 size-3 flex-none border border-ink", checked && "bg-ink")} />
      <span className="flex flex-col gap-0.5">{children}</span>
    </button>
  );
}

export function CheckoutForm({
  site,
  customer,
  navigate = (url: string) => window.location.assign(url),
}: {
  site: Site;
  customer: Customer | null;
  navigate?: (url: string) => void;
}) {
  const { cart, refresh } = useCart();
  const options = useMemo(() => deliveryOptions(site), [site]);

  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(formatPhone(customer?.phone) || "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [method, setMethod] = useState<DeliveryMethod | null>(options.length === 1 ? options[0]!.method : null);
  const [city, setCity] = useState<City | null>(null);
  const [pvz, setPvz] = useState<Pvz | null>(null);
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [courierTime, setCourierTime] = useState("");
  const [comment, setComment] = useState("");
  const [payment, setPayment] = useState<"online" | "on_delivery">("online");
  const [consentOffer, setConsentOffer] = useState(false);
  const [consentPd, setConsentPd] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ответ расчёта доставки привязан к ключу запроса: другой ключ — значит, считаем заново
  const [quoteResult, setQuoteResult] = useState<{ key: string; quote: Quote | null; error: string | null } | null>(
    null,
  );

  // Данные для расчёта стоимости: адрес на цену не влияет, поэтому не пересчитываем на каждый символ
  const quotePayload = useMemo<DeliveryIn | null>(() => {
    if (method === "pickup" || method === "courier") return { method };
    if (method === "cdek_pvz" && city && pvz) {
      return { method, city_code: city.code, city_name: city.name, pvz_code: pvz.code, pvz_address: pvz.address };
    }
    if (method === "cdek_door" && city) return { method, city_code: city.code, city_name: city.name };
    return null;
  }, [method, city, pvz]);
  const quoteKey = quotePayload ? JSON.stringify(quotePayload) + String(cart?.total_without_delivery_kop ?? 0) : null;
  const current = quoteKey !== null && quoteResult?.key === quoteKey ? quoteResult : null;
  const quote = current?.quote ?? null;
  const quoteError = current?.error ?? null;
  const quoting = quoteKey !== null && current === null;

  useEffect(() => {
    if (!quotePayload || quoteKey === null) return;
    let cancelled = false;
    shopApi.quote(quotePayload).then(
      (q) => {
        if (!cancelled) setQuoteResult({ key: quoteKey, quote: q, error: null });
      },
      (e: unknown) => {
        if (!cancelled) setQuoteResult({ key: quoteKey, quote: null, error: errorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пересчёт только при смене ключа
  }, [quoteKey]);

  const itemsTotal = cart?.total_without_delivery_kop ?? 0;
  const deliveryKop = quote?.price_kop ?? 0;
  const total = itemsTotal + deliveryKop;
  const blocked = !cart || !cart.lines.length || cart.problems.length > 0;

  function checkoutDelivery(): DeliveryIn {
    switch (method) {
      case "courier":
        return compact({ method, address: address.trim(), courier_time: courierTime.trim() });
      case "cdek_pvz":
        return compact({
          method,
          city_code: city?.code,
          city_name: city?.name,
          pvz_code: pvz?.code,
          pvz_address: pvz?.address,
        });
      case "cdek_door":
        return compact({
          method,
          city_code: city?.code,
          city_name: city?.name,
          address: address.trim(),
          postal_code: postalCode.trim(),
        });
      default:
        return { method: "pickup" };
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validateCheckout({
      name,
      phone,
      email,
      consentOffer,
      consentPd,
      delivery: {
        method: method ?? "pickup",
        cityCode: city?.code ?? null,
        pvzCode: pvz?.code ?? null,
        address,
      },
    });
    if (!method) found.delivery = "Выберите способ получения";
    else if (!found.delivery && quoteError) found.delivery = quoteError;
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Проверьте форму — выделенные поля нужно заполнить.");
      return;
    }
    if (quoting || !quote) {
      setFormError("Считаем стоимость доставки — подождите секунду и нажмите ещё раз.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await shopApi.checkout({
        name: name.trim(),
        phone: normalizePhone(phone) ?? phone.trim(),
        email: email.trim(),
        delivery: checkoutDelivery(),
        comment: comment.trim() || null,
        consent_offer: consentOffer,
        consent_pd: consentPd,
        marketing_consent: marketing,
        payment_method: payment,
        expected_total_kop: total,
      });
      if (cart) {
        ecommerce(
          "purchase",
          cart.lines.map((l) => ({ id: l.product_id, name: l.name, price: l.unit_price_kop / 100, quantity: l.qty })),
          result.number,
        );
      }
      navigate(result.payment_url ?? `/order/${result.order_id}/result`);
    } catch (e) {
      setFormError(errorMessage(e));
      if (e instanceof ApiError) {
        setErrors(fieldErrors(e));
        if (e.status === 409 || e.status === 422) void refresh();
      }
      setSubmitting(false);
    }
  }

  const offer = "/legal/offer";
  const privacy = "/legal/privacy";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[26px] bg-block p-[clamp(24px,3vw,40px)]">
      <h2 className="font-serif text-[32px] leading-tight">Оформление</h2>

      <TextField label="Имя" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Как к вам обращаться" />
      <TextField
        label="Телефон"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        placeholder="+7 900 000-00-00"
      />
      <TextField
        label="Почта"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        hint="Сюда придут чек и статус заказа"
        placeholder="you@example.ru"
      />

      <div className="flex flex-col gap-2">
        <span id="delivery-label" className="label-mono text-muted">
          Получение
        </span>
        <div role="radiogroup" aria-labelledby="delivery-label" className="flex flex-col gap-2">
          {options.map((o) => (
            <ChoiceButton
              key={o.method}
              checked={method === o.method}
              onClick={() => {
                setMethod(o.method);
                setErrors((e) => ({ ...e, delivery: undefined, address: undefined }));
              }}
            >
              <span className="text-[15px] font-medium">{o.label}</span>
              <span className="text-[13px] text-muted">{o.note}</span>
            </ChoiceButton>
          ))}
        </div>
        {errors.delivery ? <span className="text-[13px] text-red">{errors.delivery}</span> : null}
      </div>

      {method === "courier" ? (
        <>
          <TextField label="Адрес во Владимире" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} placeholder="Улица, дом, квартира" />
          <TextField label="Удобное время" value={courierTime} onChange={(e) => setCourierTime(e.target.value)} placeholder="Например, будни после 18:00" />
        </>
      ) : null}

      {method === "cdek_pvz" || method === "cdek_door" ? (
        <CityPicker
          value={city}
          onChange={(c) => {
            setCity(c);
            setPvz(null);
          }}
        />
      ) : null}

      {method === "cdek_pvz" && city ? (
        <PvzPicker
          city={city}
          value={pvz}
          onChange={setPvz}
          mapsKey={site.yandex_maps_api_key}
          originCityCode={site.delivery.origin_city_code}
        />
      ) : null}

      {method === "cdek_door" && city ? (
        <>
          <TextField label="Адрес" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} placeholder="Улица, дом, квартира" />
          <TextField label="Индекс" autoComplete="postal-code" inputMode="numeric" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Необязательно" />
        </>
      ) : null}

      {site.allow_pay_on_delivery ? (
        <div className="flex flex-col gap-2">
          <span id="payment-label" className="label-mono text-muted">
            Оплата
          </span>
          <div role="radiogroup" aria-labelledby="payment-label" className="flex flex-wrap gap-1.5">
            {(
              [
                ["online", "Онлайн — картой или СБП"],
                ["on_delivery", "При получении"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={payment === value}
                onClick={() => setPayment(value)}
                className={clsx(
                  "flex-[1_1_140px] border border-ink px-3.5 py-[11px] text-[15px]",
                  payment === value ? "bg-ink text-paper" : "bg-transparent text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <TextAreaField label="Комментарий к заказу" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например, позвоните перед доставкой" />

      <div className="flex flex-col gap-3 text-[14px] leading-snug text-text2">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 flex-none accent-ink" checked={consentOffer} onChange={(e) => setConsentOffer(e.target.checked)} />
          <span>
            Принимаю{" "}
            <Link href={offer} target="_blank" className="text-red underline underline-offset-2">
              условия оферты
            </Link>
          </span>
        </label>
        {errors.consentOffer ? <span className="-mt-2 pl-8 text-[13px] text-red">{errors.consentOffer}</span> : null}
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 flex-none accent-ink" checked={consentPd} onChange={(e) => setConsentPd(e.target.checked)} />
          <span>
            Даю согласие на{" "}
            <Link href={privacy} target="_blank" className="text-red underline underline-offset-2">
              обработку персональных данных
            </Link>
          </span>
        </label>
        {errors.consentPd ? <span className="-mt-2 pl-8 text-[13px] text-red">{errors.consentPd}</span> : null}
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 flex-none accent-ink" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>Присылать на почту новости и акции (можно отписаться в любой момент)</span>
        </label>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-[18px] text-[15px]">
        <div className="flex justify-between">
          <span className="text-muted">Товары со скидками</span>
          <span>{formatRub(itemsTotal)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Доставка</span>
          <span data-testid="checkout-delivery" className="text-right">
            {quoting
              ? "Считаем…"
              : quote
                ? quote.free || quote.price_kop === 0
                  ? "Бесплатно"
                  : formatRub(quote.price_kop)
                : method
                  ? "—"
                  : "Выберите способ"}
          </span>
        </div>
        {quote?.period ? (
          <div className="flex justify-between">
            <span className="text-muted">Срок</span>
            <span>{quote.period}</span>
          </div>
        ) : null}
        {quoteError ? <span className="text-[13px] text-red">{quoteError}</span> : null}
        <div className="flex items-baseline justify-between pt-2">
          <span className="text-[17px]">Итого</span>
          <span className="font-serif text-[36px]">{formatRub(total)}</span>
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-[15px] text-red">
          {formError}
        </p>
      ) : null}

      <button type="submit" disabled={submitting || blocked} className={buttonClass("primary", "py-[18px]")}>
        {submitting ? "Создаём заказ…" : payment === "on_delivery" ? `Оформить заказ на ${formatRub(total)}` : `Оплатить ${formatRub(total)}`}
      </button>
      <p className="text-[13px] text-muted">
        {payment === "on_delivery"
          ? "Оплатите при получении. Чек пришлём на почту."
          : "Оплата на защищённой странице банка «Точка»: карта или СБП. Чек придёт на почту."}
      </p>
    </form>
  );
}
