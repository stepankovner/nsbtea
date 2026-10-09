import { EventEditor } from "@/components/admin/content/EventEditor";

export const metadata = { title: "Событие" };

export default async function EditEventPage(props: PageProps<"/admin/content/events/[id]">) {
  const { id } = await props.params;
  return <EventEditor id={id} />;
}
