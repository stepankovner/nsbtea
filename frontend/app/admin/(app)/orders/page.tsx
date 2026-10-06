import { Suspense } from "react";

import { OrdersList } from "@/components/admin/orders/OrdersList";

export const metadata = { title: "Заказы" };

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersList />
    </Suspense>
  );
}
