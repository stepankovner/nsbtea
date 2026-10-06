"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { Schemas } from "@/lib/api/client";
import { formatRub } from "@/lib/format";
import { shopApi } from "@/lib/shop-api";

import { useCart } from "./cart-context";
import { NsbLogo } from "./NsbLogo";

type Site = Schemas["SiteOut"];

export function navItems(site: Site) {
  const items = [{ href: "/catalog", label: "Чай" }];
  if (site.thursday.active) items.push({ href: "/#chai-nedeli", label: `Чай недели −${site.thursday.percent}%` });
  items.push(
    { href: "/events", label: "Церемонии и сплавы" },
    { href: "/wholesale", label: "Оптовые заказы" },
    { href: "/about", label: "О магазине" },
  );
  return items;
}

function SearchBox({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; items: Schemas["SuggestItem"][] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const wanted = q.trim().length >= 2 ? q.trim() : null;
  const items = wanted && result?.q === wanted ? result.items : [];

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      shopApi.suggest(wanted).then(
        (found) => {
          if (!cancelled) setResult({ q: wanted, items: found });
        },
        () => undefined,
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!q.trim()) return;
    router.push(`/catalog?${new URLSearchParams({ q: q.trim() })}`);
    onDone();
  }

  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <input
        ref={input}
        id={id}
        type="search"
        aria-label="Поиск по каталогу"
        placeholder="Шу пуэр, улун, гайвань…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        className="w-full rounded-none border-0 border-b border-ink bg-transparent py-2.5 text-base outline-none"
      />
      {items.length ? (
        <ul className="absolute top-full z-40 mt-1 w-full border border-ink bg-paper">
          {items.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/product/${item.slug}`}
                onClick={onDone}
                className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-block"
              >
                <span>{item.name}</span>
                <span className="whitespace-nowrap text-sm text-muted">от {formatRub(item.price_kop)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

export function Header({ site }: { site: Site }) {
  const { count } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const items = navItems(site);
  const close = () => {
    setMenuOpen(false);
    setSearchOpen(false);
  };

  const cartLink = (
    <Link
      href="/cart"
      aria-label={`Корзина, товаров: ${count}`}
      className="flex items-center gap-2 border border-ink px-3.5 py-2 text-[15px] transition-colors hover:bg-ink hover:text-paper"
    >
      Корзина <span className="font-mono text-[13px] text-red">{count}</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line-2 bg-paper">
      <div className="container-site flex items-center justify-between gap-x-8 gap-y-4 py-3.5">
        <Link href="/" aria-label="НСБ Чай — на главную" onClick={close} className="flex">
          <NsbLogo size={12} />
        </Link>

        <nav aria-label="Разделы" className="hidden items-center gap-x-7 text-[15px] lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "border-b py-1.5 transition-colors hover:text-red",
                pathname === item.href ? "border-ink" : "border-transparent",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            aria-label="Поиск"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((v) => !v);
              setMenuOpen(false);
            }}
            className="flex size-11 items-center justify-center hover:text-red"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8.5" cy="8.5" r="6" />
              <path d="m13 13 5 5" />
            </svg>
          </button>
          <Link href="/account" className="hidden text-[15px] hover:text-red sm:inline">
            Кабинет
          </Link>
          {cartLink}
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => {
              setMenuOpen((v) => !v);
              setSearchOpen(false);
            }}
            className="flex size-11 items-center justify-center lg:hidden"
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5">
              {menuOpen ? <path d="m5 5 12 12M17 5 5 17" /> : <path d="M3 7h16M3 15h16" />}
            </svg>
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="container-site pb-4">
          <SearchBox onDone={close} />
        </div>
      ) : null}

      {menuOpen ? (
        <nav id="mobile-menu" aria-label="Меню" className="container-site flex flex-col border-t border-line-2 pb-6 lg:hidden">
          {[...items, { href: "/account", label: "Личный кабинет" }, { href: "/guides", label: "Как заваривать" }].map(
            (item) => (
              <Link key={item.href} href={item.href} onClick={close} className="border-b border-line-2 py-3.5 text-lg">
                {item.label}
              </Link>
            ),
          )}
        </nav>
      ) : null}
    </header>
  );
}
