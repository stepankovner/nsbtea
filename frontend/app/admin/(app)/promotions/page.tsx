import { PromotionsOverview } from "@/components/admin/promotions/PromotionsOverview";

export const metadata = { title: "Акции" };

/** `?archive=codes` или `?archive=promotions` — сразу открыть архив (ссылки из форм). */
export default async function PromotionsPage(props: PageProps<"/admin/promotions">) {
  const { archive } = await props.searchParams;
  return <PromotionsOverview archive={archive === "codes" || archive === "promotions" ? archive : null} />;
}
