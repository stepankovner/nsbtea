import { Suspense } from "react";

import { AuditPage } from "@/components/admin/audit/AuditLog";

export const metadata = { title: "Журнал действий" };

export default function AuditRoute() {
  return (
    <Suspense fallback={null}>
      <AuditPage />
    </Suspense>
  );
}
