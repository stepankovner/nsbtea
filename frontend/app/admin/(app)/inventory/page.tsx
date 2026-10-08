import { Suspense } from "react";

import { InventoryView } from "@/components/admin/inventory/InventoryView";

export const metadata = { title: "Склад" };

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryView />
    </Suspense>
  );
}
