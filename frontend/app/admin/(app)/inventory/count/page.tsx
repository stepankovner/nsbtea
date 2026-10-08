import { Suspense } from "react";

import { CountForm } from "@/components/admin/inventory/CountForm";

export const metadata = { title: "Инвентаризация" };

export default function CountPage() {
  return (
    <Suspense fallback={null}>
      <CountForm />
    </Suspense>
  );
}
