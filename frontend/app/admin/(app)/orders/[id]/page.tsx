import { OrderDetail } from "@/components/admin/orders/OrderDetail";

export const metadata = { title: "Заказ" };

export default async function OrderPage(props: PageProps<"/admin/orders/[id]">) {
  const { id } = await props.params;
  return <OrderDetail id={id} />;
}
