"use client";

import { useCallback } from "react";

import { TelegramLogin } from "./TelegramLogin";

export function TelegramLinkBlock({
  linked,
  username,
  botUsername,
}: {
  linked: boolean;
  username: string | null;
  botUsername: string | null;
}) {
  const done = useCallback(() => window.location.reload(), []);
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 lg:border-t-0 lg:pt-0">
      <h2 className="font-serif text-2xl">Telegram</h2>
      {linked ? (
        <p className="text-[15px] text-text2">Привязан{username ? ` (@${username})` : ""}. Можно входить через Telegram без кода.</p>
      ) : botUsername ? (
        <>
          <p className="text-[15px] text-text2">Привяжите Telegram, чтобы входить в один клик.</p>
          <TelegramLogin botUsername={botUsername} mode="link" onDone={done} />
        </>
      ) : (
        <p className="text-[15px] text-muted">Вход через Telegram скоро появится.</p>
      )}
    </section>
  );
}
