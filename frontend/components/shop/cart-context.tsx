"use client";

/**
 * Корзина на клиенте: число товаров в шапке, добавление с подтверждением внизу экрана.
 * Источник правды — сервер: после каждого действия берём корзину из ответа API.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { errorMessage } from "@/lib/api/errors";
import { ecommerce } from "@/lib/metrika";
import { shopApi, type Cart, type CartItemIn } from "@/lib/shop-api";

export interface Toast {
  id: number;
  text: string;
  link: boolean;
}

interface CartContextValue {
  cart: Cart | null;
  count: number;
  setCart: (cart: Cart) => void;
  refresh: () => Promise<void>;
  add: (item: CartItemIn, label: string, price?: { kop: number; name: string }) => Promise<boolean>;
  toast: Toast | null;
  showToast: (text: string, link?: boolean) => void;
  hideToast: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const TOAST_MS = 2600;

export function CartProvider({ children, initialCart }: { children: ReactNode; initialCart?: Cart }) {
  const [cart, setCartState] = useState<Cart | null>(initialCart ?? null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  const hideToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const showToast = useCallback((text: string, link = true) => {
    if (timer.current) clearTimeout(timer.current);
    toastId.current += 1;
    setToast({ id: toastId.current, text, link });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setCartState(await shopApi.getCart());
    } catch {
      // корзина в шапке — не критично; страница корзины покажет ошибку сама
    }
  }, []);

  useEffect(() => {
    if (initialCart) return;
    shopApi.getCart().then(setCartState, () => {
      // корзина в шапке — не критично; страница корзины покажет ошибку сама
    });
  }, [initialCart]);

  const add = useCallback<CartContextValue["add"]>(
    async (item, label, price) => {
      try {
        const next = await shopApi.addToCart(item);
        setCartState(next);
        showToast(`${label} — в корзине`, true);
        if (price) {
          ecommerce("add", [
            { id: item.product_id, name: price.name, price: price.kop / 100, quantity: item.qty, variant: label },
          ]);
        }
        return true;
      } catch (error) {
        showToast(errorMessage(error), false);
        return false;
      }
    },
    [showToast],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      count: cart?.count ?? 0,
      setCart: setCartState,
      refresh,
      add,
      toast,
      showToast,
      hideToast,
    }),
    [cart, refresh, add, toast, showToast, hideToast],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart: нет CartProvider");
  return value;
}
