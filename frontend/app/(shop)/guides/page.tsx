import type { Metadata } from "next";
import Link from "next/link";

import { Picture } from "@/components/shop/Picture";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { PUBLIC_BASE_URL } from "@/lib/shop-server";

export const metadata: Metadata = {
  title: "Как заваривать чай",
  description: "Гайды по способам заваривания: пролив, европейский способ, термос, холодное заваривание.",
  alternates: { canonical: `${PUBLIC_BASE_URL}/guides` },
};

export default async function GuidesPage() {
  const guides = await must((await serverApi()).GET("/api/pages", { params: { query: { kind: "guide" } } }));
  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)]">
      <h1 className="mb-12 font-serif text-[clamp(52px,7vw,104px)] leading-[0.95]">Как заваривать</h1>
      {guides.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-x-6 gap-y-12">
          {guides.map((g) => (
            <Link key={g.slug} href={`/guides/${g.slug}`} className="group flex flex-col gap-4">
              <div className="aspect-[4/3] overflow-hidden bg-photo">
                <Picture media={g.cover} alt={g.title} placeholder="фото" sizes="(max-width: 900px) 100vw, 33vw" />
              </div>
              <span className="font-serif text-[28px] leading-tight group-hover:text-red">{g.title}</span>
              {g.excerpt ? <span className="text-[15px] leading-[1.55] text-text2">{g.excerpt}</span> : null}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-[17px] text-text2">Гайды скоро появятся.</p>
      )}
    </section>
  );
}
