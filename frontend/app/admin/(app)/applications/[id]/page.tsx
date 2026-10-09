import { ApplicationDetail } from "@/components/admin/applications/ApplicationDetail";

export const metadata = { title: "Заявка" };

export default async function ApplicationPage(props: PageProps<"/admin/applications/[id]">) {
  const { id } = await props.params;
  return <ApplicationDetail id={id} />;
}
