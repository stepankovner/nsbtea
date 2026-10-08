import { PageEditor } from "@/components/admin/content/PageEditor";

export const metadata = { title: "Страница" };

export default async function EditPagePage(props: PageProps<"/admin/content/pages/[id]">) {
  const { id } = await props.params;
  return <PageEditor id={id} />;
}
