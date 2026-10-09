import { Suspense } from "react";

import { EventCreate } from "@/components/admin/content/EventEditor";

export const metadata = { title: "Новое событие" };

export default function NewEventPage() {
  return (
    <Suspense fallback={null}>
      <EventCreate />
    </Suspense>
  );
}
