"use client";

import { useEffect, useId, useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";

export type City = Schemas["CityOut"];

/** Поиск города СДЭК: ввод → подсказки → выбор. */
export function CityPicker({
  value,
  onChange,
  error,
}: {
  value: City | null;
  onChange: (city: City | null) => void;
  error?: string | null;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // подсказки привязаны к запросу, по которому пришли: ввели другое — старые не показываем
  const [result, setResult] = useState<{ q: string; items: City[]; error: string | null } | null>(null);

  const q = query.trim();
  const wanted = open && q.length >= 2 && !(value && q === value.name) ? q : null;
  const items = wanted !== null && result?.q === wanted ? result.items : [];
  const loadError = wanted !== null && result?.q === wanted ? result.error : null;

  useEffect(() => {
    if (wanted === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      shopApi.cities(wanted).then(
        (found) => {
          if (!cancelled) setResult({ q: wanted, items: found, error: null });
        },
        (e: unknown) => {
          if (!cancelled) setResult({ q: wanted, items: [], error: errorMessage(e) });
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted]);

  function choose(city: City) {
    onChange(city);
    setQuery(city.name);
    setOpen(false);
  }

  const shown = open && items.length > 0;
  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="label-mono text-muted">
        Город
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        placeholder="Начните вводить название"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
          if (value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const city = items[active];
            if (city) choose(city);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-none border-0 border-b border-ink bg-transparent py-2.5 text-base outline-none"
      />
      {shown ? (
        <ul id={listId} role="listbox" className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-auto border border-ink bg-paper">
          {items.map((city, index) => (
            <li
              key={city.code}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(city)}
              className={index === active ? "cursor-pointer bg-block px-3 py-2.5" : "cursor-pointer px-3 py-2.5 hover:bg-block"}
            >
              {city.name}
              {city.region ? <span className="text-muted">, {city.region}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error || loadError ? <span className="text-[13px] text-red">{error ?? loadError}</span> : null}
    </div>
  );
}
