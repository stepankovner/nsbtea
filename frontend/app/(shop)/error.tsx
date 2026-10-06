"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buttonClass } from "@/components/shop/ui";

export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="container-site flex flex-col items-start gap-7 py-[clamp(64px,9vw,140px)]">
      <span className="kicker text-green">Что-то пошло не так</span>
      <h1 className="font-serif text-[clamp(40px,6vw,80px)] leading-[0.95]">Страница не загрузилась</h1>
      <p className="max-w-[520px] text-[17px] text-text2">
        Попробуйте обновить страницу через минуту. Если не получается — напишите нам в Telegram, мы поможем оформить заказ.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={buttonClass("primary")}>
          Попробовать ещё раз
        </button>
        <Link href="/" className={buttonClass("outline")}>
          На главную
        </Link>
      </div>
    </section>
  );
}
