import Link from "next/link";

import type { Schemas } from "@/lib/api/client";
import { pageHref } from "@/lib/pages";

import { navItems } from "./Header";
import { NsbLogo } from "./NsbLogo";

function ColumnTitle({ children }: { children: string }) {
  return <span className="label-mono mb-2.5 text-green-light">{children}</span>;
}

export function Footer({ site }: { site: Schemas["SiteOut"] }) {
  const s = site.store;
  const legal = site.pages.filter((p) => p.kind === "legal");
  const info = site.pages.filter((p) => p.kind === "page" && !["about", "wholesale"].includes(p.slug));
  const links = [
    s.telegram_url && { href: s.telegram_url, label: "Telegram" },
    s.telegram_channel_url && { href: s.telegram_channel_url, label: "Канал в Telegram" },
    s.vk_url && { href: s.vk_url, label: "ВКонтакте" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <footer className="bg-ink text-paper">
      <div className="container-site flex flex-col gap-14 pb-8 pt-[clamp(56px,7vw,96px)]">
        <div className="flex flex-wrap justify-between gap-10">
          <NsbLogo size={14} tone="dark" tagline />
          <div className="flex flex-wrap gap-x-[72px] gap-y-10 text-[15px] leading-[1.7]">
            <div className="flex flex-col">
              <ColumnTitle>Магазин</ColumnTitle>
              <span>{s.address || "Владимир"}</span>
              <span className="text-forest-muted">Доставка по России</span>
              {s.work_hours ? <span className="text-forest-muted">{s.work_hours}</span> : null}
            </div>
            <div className="flex flex-col">
              <ColumnTitle>Связь</ColumnTitle>
              {s.phone ? (
                <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="hover:text-green-light">
                  {s.phone}
                </a>
              ) : null}
              {s.email ? (
                <a href={`mailto:${s.email}`} className="hover:text-green-light">
                  {s.email}
                </a>
              ) : null}
              {links.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-green-light">
                  {l.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col items-start">
              <ColumnTitle>Разделы</ColumnTitle>
              {navItems(site).map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-green-light">
                  {item.label}
                </Link>
              ))}
              <Link href="/guides" className="hover:text-green-light">
                Как заваривать
              </Link>
              {info.map((p) => (
                <Link key={p.slug} href={pageHref(p)} className="hover:text-green-light">
                  {p.title}
                </Link>
              ))}
            </div>
            {legal.length ? (
              <div className="flex max-w-[240px] flex-col items-start">
                <ColumnTitle>Документы</ColumnTitle>
                {legal.map((p) => (
                  <Link key={p.slug} href={pageHref(p)} className="leading-snug hover:text-green-light [&:not(:last-child)]:mb-1.5">
                    {p.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-footer-line pt-5 font-mono text-[11px] text-footer-muted">
          <span>
            © {new Date().getFullYear()} {s.legal_name || "НСБ Чай"}
            {s.inn ? ` · ИНН ${s.inn}` : ""}
            {s.ogrnip ? ` · ОГРНИП ${s.ogrnip}` : ""}
          </span>
          <span>Владимир</span>
        </div>
      </div>
    </footer>
  );
}
