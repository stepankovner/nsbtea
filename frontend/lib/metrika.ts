/**
 * Электронная коммерция Яндекс Метрики: события кладутся в dataLayer,
 * счётчик (если подключён в настройках) их подхватывает.
 */
interface EcommerceProduct {
  id: string;
  name: string;
  price: number; // рубли
  quantity?: number;
  variant?: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

type Action = "detail" | "add" | "remove" | "purchase";

export function ecommerce(action: Action, products: EcommerceProduct[], orderId?: string): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  const payload: Record<string, unknown> = { products };
  if (action === "purchase") payload.actionField = { id: orderId };
  window.dataLayer.push({ ecommerce: { currencyCode: "RUB", [action]: payload } });
}

export const kopToRub = (kop: number) => Math.round(kop) / 100;
