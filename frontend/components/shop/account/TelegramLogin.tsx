"use client";

import { useEffect, useRef, useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";

declare global {
  interface Window {
    onTelegramAuth?: (user: Schemas["TelegramIn"]) => void;
  }
}

/** Кнопка «Войти через Telegram» (официальный виджет). Показывается, только если бот настроен. */
export function TelegramLogin({
  botUsername,
  mode = "login",
  onDone,
}: {
  botUsername: string;
  mode?: "login" | "link";
  onDone: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.onTelegramAuth = (user) => {
      const request = mode === "link" ? shopApi.linkTelegram(user) : shopApi.telegramLogin(user);
      request.then(onDone, (e: unknown) => setError(errorMessage(e)));
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "0");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    const node = box.current;
    node?.appendChild(script);
    return () => {
      node?.replaceChildren();
      delete window.onTelegramAuth;
    };
  }, [botUsername, mode, onDone]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="min-h-[40px]" />
      {error ? (
        <p role="alert" className="text-[15px] text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
