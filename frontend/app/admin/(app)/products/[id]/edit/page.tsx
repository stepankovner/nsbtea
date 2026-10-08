import { Suspense } from "react";

import { ProductWizard } from "@/components/admin/products/ProductWizard";

export const metadata = { title: "Заполнение товара" };

export default async function ProductWizardPage(props: PageProps<"/admin/products/[id]/edit">) {
  const { id } = await props.params;
  return (
    <Suspense fallback={null}>
      <ProductWizard id={id} />
    </Suspense>
  );
}
