import { Suspense } from "react";

import { PageCreate } from "@/components/admin/content/PageCreate";

export const metadata = { title: "Новая страница" };

export default function NewPagePage() {
  return (
    <Suspense fallback={null}>
      <PageCreate />
    </Suspense>
  );
}
