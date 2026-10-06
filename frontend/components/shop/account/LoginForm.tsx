"use client";

import { useState, type FormEvent } from "react";

import { errorMessage } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";
import { isValidEmail } from "@/lib/validation";

import { buttonClass, TextField } from "../ui";

/** Только внутренние адреса — чтобы ссылкой «войти» нельзя было увести на чужой сайт. */
export function safeNext(next: string | undefined | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export function LoginForm({
  next,
  navigate = (url: string) => window.location.assign(url),
}: {
  next?: string | null;
  navigate?: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setFieldError("Проверьте адрес почты");
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      const result = await shopApi.requestCode(email.trim());
      setMessage(result.message);
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await shopApi.verifyCode(email.trim(), code.trim());
      navigate(safeNext(next));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} noValidate className="flex flex-col gap-6">
        {message ? <p className="text-[15px] text-text2">{message}</p> : null}
        <TextField
          label="Код из письма"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
          className="font-mono text-2xl tracking-[0.4em]"
        />
        {error ? (
          <p role="alert" className="text-[15px] text-red">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy || code.length < 6} className={buttonClass("primary")}>
            {busy ? "Входим…" : "Войти"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="text-[15px] text-muted underline hover:text-red"
          >
            Другая почта
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} noValidate className="flex flex-col gap-6">
      <TextField
        label="Почта"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError}
        hint="Пришлём код для входа — пароль не нужен"
        placeholder="you@example.ru"
      />
      {error ? (
        <p role="alert" className="text-[15px] text-red">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass("primary", "self-start")}>
        {busy ? "Отправляем…" : "Получить код"}
      </button>
    </form>
  );
}
