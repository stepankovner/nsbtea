"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { AuthCard } from "@/components/admin/AuthCard";
import { Field } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/errors";
import { adminAuth } from "@/lib/admin/auth";

export default function ResetPasswordPage() {
  const emailId = useId();
  const codeId = useId();
  const passId = useId();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent, action: () => Promise<unknown>, next: "code" | "done") {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
      setStep(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Восстановление пароля">
      {step === "email" ? (
        <form onSubmit={(e) => run(e, () => adminAuth.forgot(email.trim()), "code")} className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Пришлём код в Telegram-бот магазина. Это работает, если Telegram уже привязан к вашему аккаунту.
          </p>
          <Field id={emailId} label="Почта">
            <Input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy}>
            Прислать код
          </Button>
        </form>
      ) : step === "code" ? (
        <form onSubmit={(e) => run(e, () => adminAuth.reset(email.trim(), code.trim(), password), "done")} className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">Если почта верная и Telegram привязан — код уже в чате с ботом.</p>
          <Field id={codeId} label="Код из Telegram">
            <Input id={codeId} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field id={passId} label="Новый пароль" description="Не короче 10 символов. Удобно взять фразу из нескольких слов.">
            <Input id={passId} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy}>
            Сменить пароль
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p>Пароль изменён.</p>
          <Button asChild size="lg">
            <Link href="/admin/login">Войти</Link>
          </Button>
        </div>
      )}
      {step !== "done" ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Telegram не привязан? Попросите разработчика сменить пароль на сервере командой reset-password.
        </p>
      ) : null}
    </AuthCard>
  );
}
