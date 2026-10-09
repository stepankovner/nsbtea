import { Suspense } from "react";

import { ApplicationsList } from "@/components/admin/applications/ApplicationsList";

export const metadata = { title: "Заявки" };

export default function ApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <ApplicationsList />
    </Suspense>
  );
}
