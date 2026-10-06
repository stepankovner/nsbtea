import type { Metadata } from "next";

import { OrderResult } from "@/components/shop/OrderResult";

export const metadata: Metadata = { title: "Заказ", robots: { index: false } };

export default async function OrderResultPage(props: PageProps<"/order/[id]/result">) {
  const { id } = await props.params;
  const search = await props.searchParams;
  return <OrderResult orderId={id} failed={search.failed === "1"} />;
}
