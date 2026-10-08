import { ProductEditor } from "@/components/admin/products/ProductEditor";

export const metadata = { title: "Товар" };

export default async function ProductPage(props: PageProps<"/admin/products/[id]">) {
  const { id } = await props.params;
  return <ProductEditor id={id} />;
}
