import { Suspense } from "react";

import { ProductCreate } from "@/components/admin/products/ProductCreate";

export const metadata = { title: "Новый товар" };

export default function NewProductPage() {
  return (
    <Suspense fallback={null}>
      <ProductCreate />
    </Suspense>
  );
}
