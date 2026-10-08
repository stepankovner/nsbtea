import { Suspense } from "react";

import { WriteoffForm } from "@/components/admin/inventory/WriteoffForm";

export const metadata = { title: "Списание" };

export default function WriteoffPage() {
  return (
    <Suspense fallback={null}>
      <WriteoffForm />
    </Suspense>
  );
}
