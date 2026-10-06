"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Карта пунктов выдачи — официальный виджет СДЭК (v4, Яндекс Карты).
 * Подключается только когда в настройках сервера задан ключ Яндекс Карт.
 */
export function CdekMap({
  apiKey,
  city,
  originCityCode,
  onChoose,
}: {
  apiKey: string;
  city: string;
  originCityCode: number;
  onChoose: (officeCode: string) => void;
}) {
  const rootId = `cdek-map-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const onChooseRef = useRef(onChoose);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChooseRef.current = onChoose;
  }, [onChoose]);

  useEffect(() => {
    let widget: { destroy: () => void } | null = null;
    let cancelled = false;
    import("@cdek-it/widget")
      .then(({ default: Widget }) => {
        if (cancelled) return;
        widget = new Widget({
          root: rootId,
          apiKey,
          servicePath: "/api/delivery/cdek/service",
          defaultLocation: city,
          from: { code: originCityCode, postal_code: null, country_code: "RU", city: null, address: null },
          hideDeliveryOptions: { door: true, office: false },
          canChoose: true,
          popup: false,
          goods: [{ width: 20, height: 10, length: 20, weight: 500 }],
          onChoose: (_mode: unknown, _tariff: unknown, target: { code?: string }) => {
            if (target?.code) onChooseRef.current(target.code);
          },
        } as never);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      widget?.destroy();
    };
  }, [apiKey, city, originCityCode, rootId]);

  if (failed) return null;
  return <div id={rootId} className="hidden h-[480px] w-full md:block" aria-label="Карта пунктов выдачи СДЭК" />;
}
