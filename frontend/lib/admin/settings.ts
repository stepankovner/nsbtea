import { adminApi, must, type Schemas } from "./client";

export type AllSettings = Schemas["AllSettingsOut"];
export type SettingsMeta = Schemas["SettingsMetaOut"];
export type SettingsGroupKey = keyof AllSettings;

const savers: { [K in SettingsGroupKey]: (body: AllSettings[K]) => Promise<AllSettings[K]> } = {
  store: (body) => must(adminApi.PUT("/api/admin/settings/store", { body })),
  catalog: (body) => must(adminApi.PUT("/api/admin/settings/catalog", { body })),
  loyalty: (body) => must(adminApi.PUT("/api/admin/settings/loyalty", { body })),
  thursday: (body) => must(adminApi.PUT("/api/admin/settings/thursday", { body })),
  delivery: (body) => must(adminApi.PUT("/api/admin/settings/delivery", { body })),
  payment: (body) => must(adminApi.PUT("/api/admin/settings/payment", { body })),
  seo: (body) => must(adminApi.PUT("/api/admin/settings/seo", { body })),
};

export const settingsApi = {
  all: () => must(adminApi.GET("/api/admin/settings")),
  meta: () => must(adminApi.GET("/api/admin/settings/meta")),
  /** Группа сохраняется целиком (PUT), сервер возвращает сохранённые значения. */
  save: <K extends SettingsGroupKey>(group: K, body: AllSettings[K]): Promise<AllSettings[K]> =>
    (savers[group] as (b: AllSettings[K]) => Promise<AllSettings[K]>)(body),
};

export const settingsKeys = {
  all: ["settings"] as const,
  values: ["settings", "values"] as const,
  meta: ["settings", "meta"] as const,
};

export function isSettingsGroup(key: string): key is SettingsGroupKey {
  return Object.hasOwn(savers, key);
}

/** Порядок разделов и что в каждом настраивается — для списка настроек. Названия приходят с сервера. */
export const SETTINGS_GROUPS: { key: SettingsGroupKey; description: string }[] = [
  {
    key: "store",
    description: "Название, телефон, почта, ссылки на Telegram и ВКонтакте, часы работы, реквизиты ИП для подвала сайта и документов.",
  },
  {
    key: "catalog",
    description: "Варианты веса чая (25, 50, 100 г…), когда показывать «Осталось мало» и «Новинка», где показывать закончившиеся товары.",
  },
  {
    key: "loyalty",
    description: "Сколько баллов начислять, какую часть заказа можно оплатить баллами, срок жизни баллов и скидка на первый заказ.",
  },
  {
    key: "thursday",
    description: "Размер скидки на чай недели и сколько она действует — только в четверг или всю неделю.",
  },
  {
    key: "delivery",
    description: "СДЭК, курьер по Владимиру и самовывоз: цены, бесплатная доставка от суммы, вес упаковки, размеры коробок.",
  },
  {
    key: "payment",
    description: "Система налогообложения и ставка НДС для чеков, оплата при получении.",
  },
  {
    key: "seo",
    description: "Как главная выглядит в поиске Яндекса, номер счётчика Яндекс Метрики и код Яндекс Вебмастера.",
  },
];
