"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { AuthCard } from "@/components/admin/AuthCard";
import { Field } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/errors";
import { adminAuth } from "@/lib/admin/auth";
import { setCsrfToken } from "@/lib/admin/client";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const passId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => adminAuth.invite(token), retry: false });

  async function accept(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminAuth.acceptInvite(token, password);
      if (result.csrf_token) setCsrfToken(result.csrf_token);
      router.replace("/admin");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Приглашение в админку">
      {invite.isPending ? (
        <p className="text-muted-foreground">Проверяем приглашение…</p>
      ) : invite.isError ? (
        <p role="alert" className="text-destructive">
          {errorMessage(invite.error)}
        </p>
      ) : (
        <form onSubmit={accept} className="flex flex-col gap-5">
          <p>
            {invite.data.name}, вас пригласили помогать в магазине. Почта для входа: <b>{invite.data.email}</b>.
          </p>
          <Field id={passId} label="Придумайте пароль" description="Не короче 10 символов.">
            <Input id={passId} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" disabled={busy}>
            Начать работу
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
