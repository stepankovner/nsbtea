import type { Schemas } from "@/lib/api/client";

type Application = Schemas["ApplicationOut"];

export function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    type: "wholesale",
    type_label: "Опт",
    status: "new",
    status_label: "Новая",
    name: "Олег",
    phone: "+79001234567",
    telegram: null,
    guests: 1,
    data: {
      organization: "Кофейня «Ромашка»",
      city: "Владимир",
      volume: "2–3 кг",
      email: "oleg@example.ru",
      comment: "Пришлите прайс на пуэры",
    },
    event_id: null,
    event_title: null,
    admin_comment: null,
    // 12:30 по Москве
    created_at: "2026-10-07T09:30:00Z",
    ...overrides,
  };
}

export function eventApplication(overrides: Partial<Application> = {}): Application {
  return application({
    id: "a2",
    type: "event",
    type_label: "Запись на событие",
    name: "Ира",
    phone: null,
    telegram: "ira_tea",
    guests: 2,
    data: {},
    event_id: "e1",
    event_title: "Сплав по Клязьме",
    ...overrides,
  });
}

export function applicationList(
  items: Application[] = [application()],
): Schemas["ApplicationListOut"] {
  return { items, total: items.length, counts: { new: 1, in_progress: 2, closed: 5 } };
}
