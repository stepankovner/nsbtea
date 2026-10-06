"use client";

import { ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { NsbLogo } from "@/components/shop/NsbLogo";
import { bottomNav, isActive, sideNav } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

import { AdminSearch } from "./AdminSearch";
import { useAdmin } from "./session";

/** Каркас админки: боковое меню на ноутбуке, нижняя панель на телефоне (DESIGN.md). */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAdmin();
  const side = sideNav(user);
  const bottom = bottomNav(user);
  const moreActive = !bottom.some((i) => i.href !== "/admin/more" && isActive(pathname, i.href)) && pathname !== "/admin";

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Link href="/admin" className="flex h-16 items-center px-5" aria-label="Сводка">
          <NsbLogo size={10} />
        </Link>
        <nav aria-label="Разделы админки" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
          {side.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px]",
                  active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className={cn("size-[18px]", active && "text-sidebar-primary")} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-sidebar-border p-3">
          <Link href="/admin/profile" className="flex min-h-11 flex-col justify-center rounded-lg px-3 hover:bg-sidebar-accent/60">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.is_owner ? "Владелец" : "Сотрудник"}</span>
          </Link>
          <button type="button" onClick={() => void logout()} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-sidebar-accent/60">
            <LogOut className="size-4" aria-hidden="true" />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+68px)] lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <Link href="/admin" className="lg:hidden" aria-label="Сводка">
            <NsbLogo size={9} />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <AdminSearch />
            <a
              href="/"
              target="_blank"
              rel="noopener"
              className="hidden h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              На сайт
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">{children}</main>
      </div>

      <nav
        aria-label="Основные разделы"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}
      >
        {bottom.map((item) => {
          const active = item.href === "/admin/more" ? moreActive : isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px]",
                active ? "font-medium text-[#8E3236]" : "text-muted-foreground",
              )}
            >
              <Icon className="size-[22px]" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
