import { PromoCodeForm } from "@/components/admin/promotions/PromoCodeForm";

export const metadata = { title: "Промокод" };

export default async function PromoCodePage(props: PageProps<"/admin/promotions/codes/[id]">) {
  const { id } = await props.params;
  return <PromoCodeForm id={id} />;
}
