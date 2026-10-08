import { CustomerDetail } from "@/components/admin/customers/CustomerDetail";

export const metadata = { title: "Клиент" };

export default async function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  const { id } = await props.params;
  return <CustomerDetail id={id} />;
}
