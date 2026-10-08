"use client";

import {
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FileText,
  LayoutTemplate,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page";

import { RequirePermission } from "./shared";

const SECTIONS: { href: string; title: string; text: string; icon: LucideIcon }[] = [
  {
    href: "/admin/content/pages",
    title: "Страницы",
    text: "О магазине, доставка и оплата, контакты, опт, гайды «Как заваривать» и документы: оферта, политика, согласие.",
    icon: FileText,
  },
  {
    href: "/admin/content/home",
    title: "Главная страница",
    text: "Что показывать на главной и в каком порядке: баннер, чай недели, подборка товаров, о магазине, опт.",
    icon: LayoutTemplate,
  },
  {
    href: "/admin/content/events",
    title: "События",
    text: "Церемонии, сплавы и лекции: дата, место, цена, сколько мест. Записи приходят в «Заявки».",
    icon: CalendarDays,
  },
];

/** Вход в раздел «Сайт»: три понятных пункта. */
export function ContentHub() {
  return (
    <>
      <PageHeader
        title="Сайт: страницы и события"
        description="Здесь меняются тексты и фото на сайте. Покупатели видят изменения сразу после публикации."
        actions={
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-[15px] hover:bg-muted"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Открыть сайт
          </a>
        }
      />
      <RequirePermission permission="content">
        <ul className="grid gap-3 md:grid-cols-3">
          {SECTIONS.map(({ href, title, text, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-muted md:flex-col md:p-5"
              >
                <Icon className="mt-0.5 size-6 shrink-0 text-[#8E3236]" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-lg font-semibold">{title}</span>
                  <span className="text-[15px] text-muted-foreground">{text}</span>
                </span>
                <ChevronRight
                  className="mt-1 size-5 shrink-0 text-muted-foreground md:hidden"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </RequirePermission>
    </>
  );
}
