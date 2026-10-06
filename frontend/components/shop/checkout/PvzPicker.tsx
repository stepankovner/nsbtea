"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import { shopApi, type Pvz } from "@/lib/shop-api";

import { CdekMap } from "./CdekMap";
import type { City } from "./CityPicker";

/** Пункт выдачи СДЭК: список с поиском (работает везде) и карта (если подключён ключ Яндекс Карт). */
export function PvzPicker({
  city,
  value,
  onChange,
  mapsKey,
  originCityCode,
}: {
  city: City;
  value: Pvz | null;
  onChange: (pvz: Pvz) => void;
  mapsKey: string | null;
  originCityCode: number;
}) {
  // список привязан к городу, для которого загружен: сменили город — ждём новый
  const [loaded, setLoaded] = useState<{ code: number; offices: Pvz[] | null; failed: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const fresh = loaded?.code === city.code ? loaded : null;
  const offices = fresh?.offices ?? null;
  const failed = fresh?.failed ?? false;

  useEffect(() => {
    let cancelled = false;
    shopApi.offices(city.code).then(
      (list) => {
        if (!cancelled) setLoaded({ code: city.code, offices: list, failed: false });
      },
      () => {
        if (!cancelled) setLoaded({ code: city.code, offices: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [city.code]);

  const shown = useMemo(() => {
    if (!offices) return [];
    const f = filter.trim().toLowerCase();
    return f ? offices.filter((o) => `${o.name} ${o.address}`.toLowerCase().includes(f)) : offices;
  }, [offices, filter]);

  if (failed) {
    return (
      <p className="text-[15px] text-red">
        Не удалось загрузить пункты выдачи СДЭК. Попробуйте ещё раз через минуту или выберите доставку до двери.
      </p>
    );
  }
  if (!offices) return <p className="text-[15px] text-muted">Загружаем пункты выдачи…</p>;
  if (!offices.length) {
    return <p className="text-[15px] text-text2">В этом городе нет пунктов выдачи СДЭК — выберите доставку до двери.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {mapsKey ? (
        <CdekMap
          apiKey={mapsKey}
          city={city.name}
          originCityCode={originCityCode}
          onChoose={(code) => {
            const found = offices.find((o) => o.code === code);
            if (found) onChange(found);
          }}
        />
      ) : null}
      {offices.length > 6 ? (
        <input
          aria-label="Найти пункт по адресу"
          placeholder="Улица или метро"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-none border-0 border-b border-ink bg-transparent py-2 text-[15px] outline-none"
        />
      ) : null}
      <div role="radiogroup" aria-label="Пункт выдачи" className="flex max-h-80 flex-col gap-1.5 overflow-auto">
        {shown.map((office) => {
          const checked = value?.code === office.code;
          return (
            <button
              key={office.code}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(office)}
              className={clsx(
                "flex w-full items-start gap-3.5 border px-4 py-3 text-left",
                checked ? "border-ink bg-paper" : "border-line hover:border-ink",
              )}
            >
              <span className={clsx("mt-1 size-3 flex-none border border-ink", checked && "bg-ink")} />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-medium">{office.name}</span>
                <span className="text-[13px] text-muted">{office.address}</span>
                {office.workTime ? <span className="text-[12px] text-muted">{office.workTime}</span> : null}
              </span>
            </button>
          );
        })}
        {!shown.length ? <span className="text-[13px] text-muted">Ничего не нашлось</span> : null}
      </div>
    </div>
  );
}
