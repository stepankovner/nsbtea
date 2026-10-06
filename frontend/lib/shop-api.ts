/**
 * Запросы витрины и кабинета из браузера. Компоненты вызывают только эти функции —
 * так их легко подменить в тестах.
 */
import { browserApi as api, must, type Schemas } from "./api/client";

export type Cart = Schemas["CartOut"];
export type CartItemIn = Schemas["CartItemIn"];
export type DeliveryIn = Schemas["DeliveryIn"];
export type CheckoutIn = Schemas["CheckoutIn"];

/** Пункт выдачи СДЭК в удобном для списка виде. */
export interface Pvz {
  code: string;
  name: string;
  address: string;
  workTime: string;
}

interface CdekOffice {
  code?: string;
  name?: string;
  work_time?: string;
  location?: { address?: string; address_full?: string; city?: string };
}

export const shopApi = {
  getCart: () => must(api.GET("/api/cart")),
  addToCart: (item: CartItemIn) => must(api.POST("/api/cart/items", { body: item })),
  updateLine: (id: string, patch: Schemas["CartItemPatch"]) =>
    must(api.PATCH("/api/cart/items/{item_id}", { params: { path: { item_id: id } }, body: patch })),
  removeLine: (id: string) =>
    must(api.DELETE("/api/cart/items/{item_id}", { params: { path: { item_id: id } } })),
  applyPromo: (code: string) => must(api.PUT("/api/cart/promo-code", { body: { code } })),
  removePromo: () => must(api.DELETE("/api/cart/promo-code")),
  setPoints: (body: { points?: number; max?: boolean }) =>
    must(api.PUT("/api/cart/points", { body: { points: body.points ?? null, max: body.max ?? false } })),

  quote: (delivery: DeliveryIn) => must(api.POST("/api/delivery/quote", { body: { delivery } })),
  cities: (q: string) => must(api.GET("/api/delivery/cities", { params: { query: { q } } })),
  offices: async (cityCode: number): Promise<Pvz[]> => {
    const params = new URLSearchParams({
      action: "offices",
      city_code: String(cityCode),
      type: "PVZ",
      is_handout: "true",
    });
    const response = await fetch(`/api/delivery/cdek/service?${params}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error("offices");
    const raw = (await response.json()) as CdekOffice[];
    return raw
      .filter((o) => o.code)
      .map((o) => ({
        code: o.code ?? "",
        name: o.name ?? o.code ?? "",
        address: o.location?.address_full ?? o.location?.address ?? "",
        workTime: o.work_time ?? "",
      }));
  },

  checkout: (body: CheckoutIn) => must(api.POST("/api/checkout", { body })),
  orderStatus: (id: string) =>
    must(api.GET("/api/orders/{order_id}/status", { params: { path: { order_id: id } } })),
  retryPayment: (id: string) =>
    must(api.POST("/api/orders/{order_id}/retry-payment", { params: { path: { order_id: id } } })),

  customPrice: (slug: string, grams: number) =>
    must(
      api.GET("/api/catalog/products/{slug}/price", {
        params: { path: { slug }, query: { grams } },
      }),
    ),
  suggest: (q: string) => must(api.GET("/api/catalog/suggest", { params: { query: { q } } })),
  sendApplication: (body: Schemas["ApplicationIn"]) => must(api.POST("/api/applications", { body })),

  requestCode: (email: string) => must(api.POST("/api/auth/code", { body: { email } })),
  verifyCode: (email: string, code: string) =>
    must(api.POST("/api/auth/verify", { body: { email, code } })),
  telegramLogin: (body: Schemas["TelegramIn"]) => must(api.POST("/api/auth/telegram", { body })),
  logout: () => must(api.POST("/api/auth/logout")),

  favoriteOn: (productId: string) =>
    must(api.PUT("/api/account/favorites/{product_id}", { params: { path: { product_id: productId } } })),
  favoriteOff: (productId: string) =>
    must(api.DELETE("/api/account/favorites/{product_id}", { params: { path: { product_id: productId } } })),
};
