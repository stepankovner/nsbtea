import { Suspense } from "react";

import { CustomersList } from "@/components/admin/customers/CustomersList";

export const metadata = { title: "Клиенты" };

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersList />
    </Suspense>
  );
}
