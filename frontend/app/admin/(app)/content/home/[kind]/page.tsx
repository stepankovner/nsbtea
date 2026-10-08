import { HomeBlockEditor } from "@/components/admin/content/HomeBlockEditor";

export const metadata = { title: "Блок главной" };

export default async function HomeBlockPage(props: PageProps<"/admin/content/home/[kind]">) {
  const { kind } = await props.params;
  return <HomeBlockEditor kind={kind} />;
}
