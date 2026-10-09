import { Suspense } from "react";

import { EventsList } from "@/components/admin/content/EventsList";

export const metadata = { title: "События" };

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsList />
    </Suspense>
  );
}
