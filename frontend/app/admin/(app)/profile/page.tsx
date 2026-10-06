"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Field } from "@/components/admin/Field";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/errors";
import { adminAuth } from "@/lib/admin/auth";
import { formatDateTime } from "@/lib/format";

export default function ProfilePage() {
  const { user, refresh } = useAdmin();
  const currentId = useId();
  const nextId = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => adminAuth.changePassword(current, next),
    onSuccess: () => {
      toast.success("Пароль изменён");
      setCurrent("");
      setNext("");
      setError(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const link = useMutation({ mutationFn: adminAuth.telegramLink });

  return (
    <>
      <PageHeader title="Мой профиль" description={`${user.name} · ${user.email}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Telegram" id="profile-telegram">
          {user.telegram_linked ? (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-2">
                <StatusBadge tone="success">Привязан</StatusBadge>
                Коды входа и уведомления приходят в Telegram.
              </p>
              <ConfirmAction
                trigger="Отвязать Telegram"
                title="Отвязать Telegram?"
                description="Вход станет только по паролю, а восстановить пароль через бота не получится, пока не привяжете снова."
                confirm="Отвязать"
                onConfirm={async () => {
                  await adminAuth.telegramUnlink();
                  await refresh();
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-[15px] text-muted-foreground">
                Привяжите Telegram — туда будут приходить коды для входа, новые заказы и заявки. Без этого восстановить пароль не
                получится.
              </p>
              {link.data ? (
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px]">
                  <li>
                    Откройте бота по ссылке:{" "}
                    <a href={link.data.deep_link} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                      открыть в Telegram
                    </a>
                  </li>
                  <li>
                    Нажмите «Запустить» (Start). Если бот попросит код — отправьте <b className="font-mono text-base">{link.data.code}</b>
                  </li>
                  <li>Вернитесь сюда и нажмите «Проверить».</li>
                  <li className="list-none text-sm text-muted-foreground">Код действует до {formatDateTime(link.data.expires_at)}.</li>
                </ol>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => link.mutate()} disabled={link.isPending}>
                  {link.data ? "Новый код" : "Привязать Telegram"}
                </Button>
                {link.data ? (
                  <Button variant="outline" onClick={() => void refresh()}>
                    Проверить
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Сменить пароль" id="profile-password">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              change.mutate();
            }}
          >
            <Field id={currentId} label="Текущий пароль">
              <Input id={currentId} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field id={nextId} label="Новый пароль" description="Не короче 10 символов.">
              <Input id={nextId} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={change.isPending || !current || !next} className="self-start">
              Сменить пароль
            </Button>
          </form>
        </SectionCard>
      </div>
    </>
  );
}
