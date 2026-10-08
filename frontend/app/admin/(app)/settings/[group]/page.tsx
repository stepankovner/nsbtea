import { SettingsGroupPage } from "@/components/admin/settings/SettingsGroupForm";

export const metadata = { title: "Настройки" };

export default async function SettingsGroupRoute(props: PageProps<"/admin/settings/[group]">) {
  const { group } = await props.params;
  return <SettingsGroupPage group={group} />;
}
