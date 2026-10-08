import { PromotionForm } from "@/components/admin/promotions/PromotionForm";

export const metadata = { title: "Акция" };

export default async function PromotionPage(props: PageProps<"/admin/promotions/[id]">) {
  const { id } = await props.params;
  return <PromotionForm id={id} />;
}
