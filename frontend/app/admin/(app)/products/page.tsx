import { Suspense } from "react";

import { ProductsList } from "@/components/admin/products/ProductsList";

export const metadata = { title: "Товары" };

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsList />
    </Suspense>
  );
}
