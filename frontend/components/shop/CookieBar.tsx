"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "nsb_cookie_ok";
const EVENT = "nsb-cookie-ok";

function accepted(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Полоска о cookie внизу экрана: не закрывает контент и не мешает пользоваться сайтом (SPEC 12). */
export function CookieBar() {
  // на сервере не показываем — появится после загрузки, если согласия ещё нет
  const hidden = useSyncExternalStore(subscribe, accepted, () => true);
  if (hidden) return null;

  return (
    <section
      aria-label="Файлы cookie"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85"
    >
      <div className="container-site flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-[13px] text-text2">
        <p>
          <span className="sm:hidden">Сайт использует cookie и Яндекс Метрику.</span>
          <span className="hidden sm:inline">
            Сайт использует файлы cookie и Яндекс Метрику, чтобы корзина работала, а мы понимали, что улучшить.
          </span>{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-red">
            Подробнее
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, "1");
            } catch {
              // приватный режим — скроется до перезагрузки
            }
            window.dispatchEvent(new Event(EVENT));
          }}
          className="rounded-full border border-ink px-4 py-1.5 text-[13px] font-medium hover:bg-ink hover:text-paper"
        >
          Понятно
        </button>
      </div>
    </section>
  );
}
