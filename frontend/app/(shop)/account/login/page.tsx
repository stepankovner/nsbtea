import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/shop/account/LoginPanel";
import { safeNext } from "@/components/shop/account/LoginForm";
import { getCustomer, getSite } from "@/lib/shop-server";

export const metadata: Metadata = { title: "Вход в личный кабинет", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/account/login">) {
  const search = await props.searchParams;
  const next = typeof search.next === "string" ? search.next : null;
  const [customer, site] = await Promise.all([getCustomer(), getSite()]);
  if (customer) redirect(safeNext(next));
  return (
    <section className="container-site grid gap-12 pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)] lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-[clamp(44px,6vw,88px)] leading-[0.98]">Личный кабинет</h1>
        <p className="max-w-[460px] text-[17px] leading-[1.6] text-text2">
          Заказы, баллы и избранное. Пароль не нужен — пришлём код на почту. Если вы уже заказывали у нас, используйте ту же
          почту: заказы и баллы будут на месте.
        </p>
      </div>
      <div className="max-w-[480px]">
        <LoginPanel next={next} botUsername={site.telegram_bot_username} />
      </div>
    </section>
  );
}
