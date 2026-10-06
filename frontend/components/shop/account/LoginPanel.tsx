"use client";

import { useCallback } from "react";

import { LoginForm, safeNext } from "./LoginForm";
import { TelegramLogin } from "./TelegramLogin";

export function LoginPanel({ next, botUsername }: { next: string | null; botUsername: string | null }) {
  const done = useCallback(() => window.location.assign(safeNext(next)), [next]);
  return (
    <div className="flex flex-col gap-10">
      <LoginForm next={next} />
      {botUsername ? (
        <div className="flex flex-col gap-3 border-t border-line pt-8">
          <span className="label-mono text-muted">Или</span>
          <TelegramLogin botUsername={botUsername} onDone={done} />
        </div>
      ) : null}
    </div>
  );
}
