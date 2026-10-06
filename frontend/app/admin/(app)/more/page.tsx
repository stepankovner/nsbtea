"use client";

import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { moreNav } from "@/lib/admin/nav";

export default function MorePage() {
  const { user, logout } = useAdmin();
  return (
    <>
      <PageHeader title="Ещё" />
      <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {moreNav(user).map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} className="border-b last:border-b-0">
              <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted">
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-[16px]">{item.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={() => void logout()} className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-red-700 hover:bg-muted">
            <LogOut className="size-5" aria-hidden="true" />
            Выйти
          </button>
        </li>
      </ul>
    </>
  );
}
