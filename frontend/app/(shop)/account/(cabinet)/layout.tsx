import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AccountNav } from "@/components/shop/account/AccountNav";
import { plural } from "@/lib/format";
import { getCustomer } from "@/lib/shop-server";

export default async function CabinetLayout({ children }: LayoutProps<"/account">) {
  const me = await getCustomer();
  if (!me) {
    const path = (await headers()).get("x-pathname") ?? "/account";
    redirect(`/account/login?next=${encodeURIComponent(path)}`);
  }
  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <span className="kicker text-green">{me.email}</span>
          <h1 className="font-serif text-[clamp(40px,6vw,80px)] leading-[0.98]">{me.name ? `${me.name}, здравствуйте` : "Личный кабинет"}</h1>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-serif text-[40px] leading-none">{me.points_balance}</span>
          <span className="font-mono text-xs text-muted">
            {plural(me.points_balance, "балл", "балла", "баллов")} на счёте
            {me.points_pending ? ` · ещё ${me.points_pending} ожидают` : ""}
          </span>
        </div>
      </div>
      <AccountNav />
      {children}
    </section>
  );
}
