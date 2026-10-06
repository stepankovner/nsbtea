import type { Metadata } from "next";
import Link from "next/link";

import { TeaCard } from "@/components/shop/TeaCard";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Избранное", robots: { index: false } };

export default async function FavoritesPage() {
  const items = await must((await serverApi()).GET("/api/account/favorites"));
  if (!items.length) {
    return (
      <p className="text-[17px] text-text2">
        Здесь будут чаи, которые вы отметили сердечком на странице товара.{" "}
        <Link href="/catalog" className="text-red underline">
          Перейти в каталог
        </Link>
      </p>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-x-6 gap-y-12">
      {items.map((p) => (
        <TeaCard key={p.id} product={p} />
      ))}
    </div>
  );
}
