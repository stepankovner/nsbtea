"use client";

import { useId, useState, type FormEvent } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";

import { buttonClass, TextField } from "../ui";

type Address = Schemas["AddressOut"];
type Kind = Schemas["AddressIn"]["kind"];

const KIND_LABELS: Record<Kind, string> = {
  courier: "Курьер по Владимиру",
  cdek_door: "СДЭК до двери",
  cdek_pvz: "Пункт выдачи СДЭК",
};

export function AddressBook({ initial }: { initial: Address[] }) {
  const selectId = useId();
  const [items, setItems] = useState(initial);
  const [kind, setKind] = useState<Kind>("courier");
  const [label, setLabel] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      setError("Укажите адрес");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await shopApi.addAddress({ kind, label: label.trim(), data: {}, is_default: isDefault });
      setItems((list) => [...list.map((a) => (created.is_default ? { ...a, is_default: false } : a)), created]);
      setLabel("");
      setIsDefault(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: Address) {
    try {
      await shopApi.deleteAddress(address.id);
      setItems((list) => list.filter((a) => a.id !== address.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-10">
      {items.length ? (
        <ul className="border-t border-ink">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
              <span className="flex flex-col gap-1">
                <span className="text-[17px]">{a.label}</span>
                <span className="font-mono text-xs text-muted">
                  {KIND_LABELS[a.kind]}
                  {a.is_default ? " · основной" : ""}
                </span>
              </span>
              <button type="button" aria-label={`Удалить: ${a.label}`} onClick={() => remove(a)} className="text-sm text-muted hover:text-red">
                Удалить
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[17px] text-text2">Пока нет сохранённых адресов. Добавьте адрес — он пригодится при следующем заказе.</p>
      )}

      <form onSubmit={add} noValidate className="flex flex-col gap-5 bg-block p-[clamp(20px,3vw,32px)]">
        <h2 className="font-serif text-2xl">Новый адрес</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="label-mono text-muted">
            Способ
          </label>
          <select
            id={selectId}
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="rounded-none border-0 border-b border-ink bg-transparent py-2.5 text-base outline-none"
          >
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Адрес"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kind === "cdek_pvz" ? "Город, адрес пункта выдачи" : "Город, улица, дом, квартира"}
        />
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" className="size-5 accent-ink" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Сделать основным
        </label>
        {error ? (
          <p role="alert" className="text-[15px] text-red">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={buttonClass("primary", "self-start")}>
          Сохранить адрес
        </button>
      </form>
    </div>
  );
}
