import { Suspense } from "react";

import { PagesList } from "@/components/admin/content/PagesList";

export const metadata = { title: "Страницы" };

export default function PagesPage() {
  return (
    <Suspense fallback={null}>
      <PagesList />
    </Suspense>
  );
}
