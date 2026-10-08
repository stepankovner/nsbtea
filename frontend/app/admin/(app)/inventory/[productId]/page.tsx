import { Suspense } from "react";

import { ProductStock } from "@/components/admin/inventory/ProductStock";

export const metadata = { title: "Склад: товар" };

export default async function ProductStockPage(props: PageProps<"/admin/inventory/[productId]">) {
  const { productId } = await props.params;
  return (
    <Suspense fallback={null}>
      <ProductStock id={productId} />
    </Suspense>
  );
}
