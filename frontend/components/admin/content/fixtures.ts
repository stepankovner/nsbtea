import type { Schemas } from "@/lib/api/client";

type Page = Schemas["PageAdminOut"];
type Block = Schemas["AdminHomeBlockOut"];
type Event = Schemas["EventAdminOut"];

export const DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Расскажите о магазине и о чайном мастере" }],
    },
  ],
};

export function adminPage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    title: "О магазине",
    slug: "about",
    kind: "page",
    content: DOC,
    excerpt: null,
    cover: null,
    is_published: true,
    sort_order: 0,
    seo_title: null,
    seo_description: null,
    required: false,
    updated_at: "2026-10-01T10:00:00Z",
    site_url: "https://nsbtea.ru/pages/about",
    ...overrides,
  };
}

export function homeBlocks(): Block[] {
  return [
    {
      kind: "hero",
      label: "Главный баннер",
      data: {
        kicker_left: "Интернет-магазин · Владимир",
        kicker_right: "Чай · Церемонии · Сплавы",
        title_line1: "Китайский чай",
        title_line2: "во Владимире",
        text: "Пуэры, улуны, красные и белые чаи с доставкой.",
        primary_label: "Выбрать чай",
        primary_href: "/catalog",
        secondary_label: "Записаться на церемонию",
        secondary_href: "/events",
        image_media_id: null,
        image_caption: "фото: чайная церемония",
        // поле, которого нет в форме, — не должно потеряться при сохранении
        legacy_note: "оставить как есть",
      },
      images: {},
      sort_order: 0,
      is_visible: true,
    },
    {
      kind: "thursday",
      label: "Чай недели",
      data: { title: "Три чая недели со скидкой", note: "Каждый четверг — новые три чая." },
      images: {},
      sort_order: 1,
      is_visible: true,
    },
    {
      kind: "advantages",
      label: "Преимущества",
      data: {
        title: "Почему у нас",
        items: [
          { title: "Любая граммовка", text: "25, 50, 100 г или свой вес." },
          { title: "Баллы за покупки", text: "5% возвращаются баллами." },
        ],
      },
      images: {},
      sort_order: 2,
      is_visible: false,
    },
  ];
}

export function adminEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "e1",
    type: "rafting",
    type_label: "Сплав на сапах",
    title: "Сплав по Клязьме",
    slug: "splav-po-klyazme",
    // 19:00 по Москве
    starts_at: "2026-10-15T16:00:00Z",
    ends_at: null,
    duration_text: "около 4 часов",
    place: "Клязьма, лодочная станция",
    price_kop: 350_000,
    price_text: null,
    seats_total: 8,
    seats_taken: 3,
    seats_left: 5,
    note: null,
    cover: null,
    short_description: "Несколько часов по реке и чай на берегу",
    description: null,
    is_published: true,
    is_past: false,
    applications_count: 2,
    ...overrides,
  };
}
