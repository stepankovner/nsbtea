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
    <div className="grid grid-cols-2 gap-x-3 gap-y-10 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] sm:gap-x-6 sm:gap-y-12">
      {items.map((p) => (
        <TeaCard key={p.id} product={p} />
      ))}
    </div>
  );
}
