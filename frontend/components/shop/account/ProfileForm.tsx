"use client";

import { useState, type FormEvent } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPhone, plural } from "@/lib/format";
import { shopApi } from "@/lib/shop-api";
import { normalizePhone } from "@/lib/validation";

import { buttonClass, TextField } from "../ui";

type Me = Schemas["CustomerMeOut"];

export function ProfileForm({
  me,
  navigate = (url: string) => window.location.assign(url),
}: {
  me: Me;
  navigate?: (url: string) => void;
}) {
  const [name, setName] = useState(me.name ?? "");
  const [phone, setPhone] = useState(formatPhone(me.phone));
  const [marketing, setMarketing] = useState(me.marketing_consent);
  const [state, setState] = useState<{ saving: boolean; saved: boolean; error: string | null }>({ saving: false, saved: false, error: null });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const normalized = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !normalized) {
      setPhoneError("Нужен номер из 10–11 цифр");
      return;
    }
    setPhoneError(null);
    setState({ saving: true, saved: false, error: null });
    try {
      await shopApi.updateProfile({ name: name.trim() || null, phone: normalized, marketing_consent: marketing });
      setState({ saving: false, saved: true, error: null });
    } catch (e) {
      setState({ saving: false, saved: false, error: errorMessage(e) });
    }
  }

  async function remove() {
    setDeleteError(null);
    try {
      await shopApi.deleteAccount();
      navigate("/");
    } catch (e) {
      setDeleteError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <form onSubmit={save} noValidate className="flex max-w-[520px] flex-col gap-6">
        <TextField label="Имя" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Телефон"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError}
        />
        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-muted">Почта</span>
          <span className="py-1 text-base">{me.email}</span>
          <span className="text-[13px] text-muted">Почта — это ваш логин. Чтобы сменить её, напишите нам.</span>
        </div>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" className="mt-0.5 size-5 accent-ink" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>Присылать на почту новости и акции</span>
        </label>
        {state.error ? (
          <p role="alert" className="text-[15px] text-red">
            {state.error}
          </p>
        ) : null}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={state.saving} className={buttonClass("primary")}>
            {state.saving ? "Сохраняем…" : "Сохранить"}
          </button>
          {state.saved ? <span className="text-[15px] text-green">Сохранено</span> : null}
        </div>
      </form>

      <section className="flex max-w-[620px] flex-col gap-4 border-t border-line pt-8">
        <h2 className="font-serif text-2xl">Удаление аккаунта</h2>
        {!deleting ? (
          <button type="button" onClick={() => setDeleting(true)} className="self-start text-[15px] text-red underline">
            Удалить аккаунт
          </button>
        ) : (
          <div className="flex flex-col gap-4 bg-block p-5">
            <p className="text-[15px] leading-relaxed text-text2">
              Мы обезличим ваши данные: имя, телефон и почта удалятся, войти больше не получится. Заказы останутся в учёте
              магазина без ваших данных.{" "}
              {me.points_balance > 0
                ? `На счёте ${me.points_balance} ${plural(me.points_balance, "балл", "балла", "баллов")} — баллы сгорят.`
                : "Накопленные баллы сгорят."}
            </p>
            <TextField label="Напишите «удалить», чтобы подтвердить" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            {deleteError ? (
              <p role="alert" className="text-[15px] text-red">
                {deleteError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={remove}
                disabled={confirmText.trim().toLowerCase() !== "удалить"}
                className={buttonClass("primary")}
              >
                Да, удалить навсегда
              </button>
              <button type="button" onClick={() => setDeleting(false)} className={buttonClass("outline")}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
