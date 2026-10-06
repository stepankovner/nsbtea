"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { shopApi } from "@/lib/shop-api";

const TABS = [
  { href: "/account", label: "Заказы" },
  { href: "/account/points", label: "Баллы" },
  { href: "/account/favorites", label: "Избранное" },
  { href: "/account/addresses", label: "Адреса" },
  { href: "/account/profile", label: "Профиль" },
];

export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav aria-label="Личный кабинет" className="mb-10 flex flex-wrap items-center gap-1.5 border-y border-b-line border-t-ink py-3">
      {TABS.map((t) => {
        const active = t.href === "/account" ? pathname === "/account" || pathname.startsWith("/account/orders") : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={clsx("px-3.5 py-2 text-[15px]", active ? "bg-ink text-paper" : "hover:bg-block")}
          >
            {t.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={async () => {
          await shopApi.logout().catch(() => undefined);
          router.push("/");
          router.refresh();
        }}
        className="ml-auto px-2 py-2 text-sm text-muted hover:text-red"
      >
        Выйти
      </button>
    </nav>
  );
}
