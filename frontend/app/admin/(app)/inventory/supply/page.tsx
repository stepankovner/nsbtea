import { Suspense } from "react";

import { SupplyForm } from "@/components/admin/inventory/SupplyForm";

export const metadata = { title: "Принять поставку" };

export default function SupplyPage() {
  return (
    <Suspense fallback={null}>
      <SupplyForm />
    </Suspense>
  );
}
