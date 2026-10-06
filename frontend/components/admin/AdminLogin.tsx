"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { adminAuth } from "@/lib/admin/auth";

import { Field } from "./Field";

type User = Schemas["AdminUserOut"];

export function AdminLogin({ onSuccess }: { onSuccess: (user: User, csrf: string) => void }) {
  const emailId = useId();
  const passwordId = useId();
  const codeId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await adminAuth.login(email.trim(), password);
      if (result.status === "two_factor_required" && result.challenge_id) {
        setChallenge(result.challenge_id);
      } else if (result.user && result.csrf_token) {
        onSuccess(result.user, result.csrf_token);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      const result = await adminAuth.twoFactor(challenge, code.trim());
      if (result.user && result.csrf_token) onSuccess(result.user, result.csrf_token);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <form onSubmit={submitCode} className="flex flex-col gap-5">
        <p className="text-[15px] text-muted-foreground">
          Отправили код в Telegram — откройте чат с ботом магазина. Код действует 10 минут.
        </p>
        <Field id={codeId} label="Код из Telegram">
          <Input
            id={codeId}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="font-mono text-lg tracking-[0.3em]"
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={busy || code.length < 4}>
          {busy ? "Проверяем…" : "Подтвердить"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setChallenge(null)}>
          Назад
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="flex flex-col gap-5">
      <Field id={emailId} label="Почта">
        <Input id={emailId} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field id={passwordId} label="Пароль">
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Входим…" : "Войти"}
      </Button>
      <Link href="/admin/reset" className="self-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Забыли пароль?
      </Link>
    </form>
  );
}
