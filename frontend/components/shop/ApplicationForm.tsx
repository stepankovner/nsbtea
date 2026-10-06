"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { errorMessage } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";
import { validateApplication, type FormErrors } from "@/lib/validation";

import { buttonClass, Stepper, TextAreaField, TextField } from "./ui";

type Kind = "wholesale" | "event" | "private_ceremony";

interface ExtraField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

const EXTRA: Record<Kind, ExtraField[]> = {
  wholesale: [
    { key: "organization", label: "Организация", placeholder: "Кофейня «Ромашка»" },
    { key: "city", label: "Город", placeholder: "Владимир" },
    { key: "volume", label: "Объём в месяц", placeholder: "Например, 2–3 кг" },
    { key: "comment", label: "Комментарий", multiline: true },
  ],
  event: [],
  private_ceremony: [
    { key: "date", label: "Желаемая дата", placeholder: "например, 14 ноября" },
    { key: "guests", label: "Сколько гостей", placeholder: "12" },
    { key: "occasion", label: "Повод и место", placeholder: "День рождения, дома / офис / база отдыха" },
    { key: "comment", label: "Комментарий", multiline: true },
  ],
};

const SUBMIT: Record<Kind, string> = {
  wholesale: "Запросить прайс",
  event: "Записаться",
  private_ceremony: "Отправить заявку",
};

const THANKS_NOTE: Record<Kind, string> = {
  wholesale: "Свяжемся с вами и пришлём прайс.",
  event: "Позвоним или напишем, чтобы подтвердить запись.",
  private_ceremony: "Перезвоним, чтобы обсудить детали.",
};

export function ApplicationForm({
  type,
  eventId,
  maxGuests = 10,
  priceLabel,
  tone = "light",
}: {
  type: Kind;
  eventId?: string;
  maxGuests?: number;
  priceLabel?: string | null;
  tone?: "light" | "dark";
}) {
  const extra = EXTRA[type];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(extra.map((f) => [f.key, ""])),
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [guests, setGuests] = useState(1);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);
  const dark = tone === "dark";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateApplication({ name, phone, telegram, consent });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      const result = await shopApi.sendApplication({
        type,
        name: name.trim(),
        phone: phone.trim() || null,
        telegram: telegram.trim() || null,
        ...(eventId ? { event_id: eventId } : {}),
        guests,
        data: Object.fromEntries(extra.map((f) => [f.key, (values[f.key] ?? "").trim()])),
        consent,
        website,
      });
      setThanks(result.message);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  if (thanks) {
    return (
      <div className="flex flex-col gap-3 pt-2" role="status">
        <span className="font-serif text-[32px] leading-tight">{thanks}</span>
        <span className={dark ? "text-base text-forest-muted" : "text-base text-text2"}>{THANKS_NOTE[type]}</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative grid gap-x-7 gap-y-6 sm:grid-cols-2">
      {extra.map((f) =>
        f.multiline ? (
          <TextAreaField
            key={f.key}
            label={f.label}
            tone={tone}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            wrapperClassName="sm:col-span-2"
          />
        ) : (
          <TextField
            key={f.key}
            label={f.label}
            tone={tone}
            placeholder={f.placeholder}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        ),
      )}
      <TextField label="Имя" tone={tone} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Как к вам обращаться" />
      <TextField
        label="Телефон"
        tone={tone}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+7 900 000-00-00"
      />
      <TextField
        label="Telegram"
        tone={tone}
        value={telegram}
        onChange={(e) => setTelegram(e.target.value)}
        placeholder="@username"
        hint="Телефон или Telegram — достаточно одного"
      />
      {type === "event" ? (
        <div className="flex flex-col gap-1.5">
          <span className={dark ? "label-mono text-green-light" : "label-mono text-muted"}>Гостей</span>
          <Stepper
            value={guests}
            max={Math.max(1, maxGuests)}
            onChange={setGuests}
            shape="square"
            size="sm"
            decreaseLabel="Меньше гостей"
            increaseLabel="Больше гостей"
          />
        </div>
      ) : null}
      {errors.contact ? <span className={dark ? "text-[13px] text-red-light sm:col-span-2" : "text-[13px] text-red sm:col-span-2"}>{errors.contact}</span> : null}

      {/* ловушка для ботов: людям поле не видно */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Сайт
          <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <label className="flex items-start gap-3 text-[14px] leading-snug sm:col-span-2">
        <input type="checkbox" className="mt-0.5 size-5 flex-none accent-ink" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Даю согласие на{" "}
          <Link href="/legal/consent" target="_blank" className={dark ? "underline" : "text-red underline"}>
            обработку персональных данных
          </Link>
        </span>
      </label>
      {errors.consent ? <span className={dark ? "-mt-4 text-[13px] text-red-light sm:col-span-2" : "-mt-4 text-[13px] text-red sm:col-span-2"}>{errors.consent}</span> : null}

      {formError ? (
        <p role="alert" className={dark ? "text-[15px] text-red-light sm:col-span-2" : "text-[15px] text-red sm:col-span-2"}>
          {formError}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button type="submit" disabled={sending} className={buttonClass(dark ? "light" : "primary")}>
          {sending ? "Отправляем…" : priceLabel ? `${SUBMIT[type]} · ${priceLabel}` : SUBMIT[type]}
        </button>
      </div>
    </form>
  );
}
