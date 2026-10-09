import { redirect } from "next/navigation";
import { Suspense } from "react";

import { InventoryView } from "@/components/admin/inventory/InventoryView";

export const metadata = { title: "Склад" };

export default async function InventoryPage(props: PageProps<"/admin/inventory">) {
  const { product, tab } = await props.searchParams;
  // «склад этого товара» (?product=id) — это страница товара на складе; во вкладке «История» — фильтр
  if (typeof product === "string" && product && tab !== "history") {
    redirect(`/admin/inventory/${encodeURIComponent(product)}`);
  }
  return (
    <Suspense fallback={null}>
      <InventoryView />
    </Suspense>
  );
}
