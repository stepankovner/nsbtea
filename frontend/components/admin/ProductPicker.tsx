"use client";

import { useQuery } from "@tanstack/react-query";
import { Package, Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lookupProducts, type LookupProduct } from "@/lib/admin/lookup";

import { Hint } from "./Hint";

function Thumb({ product }: { product: LookupProduct }) {
  return product.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- миниатюра из медиатеки
    <img src={product.image_url} alt="" className="size-10 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
      <Package className="size-4 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/** Выбор товаров: список выбранных и поиск по названию (для акций, четвергов, связанных товаров). */
export function ProductPicker({
  label,
  value,
  onChange,
  max,
  hint,
  exclude = [],
  onPickProduct,
}: {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  hint?: React.ReactNode;
  exclude?: string[];
  /** вызывается с выбранным товаром целиком (например, чтобы вставить карточку в текст) */
  onPickProduct?: (product: LookupProduct) => void;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [known, setKnown] = useState<Record<string, LookupProduct>>({});

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const missing = value.filter((id) => !known[id]);
  const selected = useQuery({
    queryKey: ["lookup", "ids", missing],
    queryFn: () => lookupProducts({ ids: missing }),
    enabled: missing.length > 0,
  });
  const search = useQuery({
    queryKey: ["lookup", "q", debounced],
    queryFn: () => lookupProducts({ q: debounced || undefined }),
    enabled: open,
  });

  const byId: Record<string, LookupProduct> = { ...known };
  for (const p of selected.data ?? []) byId[p.id] = p;
  const full = max !== undefined && value.length >= max;

  function add(product: LookupProduct) {
    setKnown((k) => ({ ...k, [product.id]: product }));
    onPickProduct?.(product);
    if (!value.includes(product.id)) onChange([...value, product.id]);
    setOpen(false);
    setQ("");
  }

  const options = (search.data ?? []).filter((p) => !value.includes(p.id) && !exclude.includes(p.id));

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <div className="flex min-h-7 items-center gap-1">
        <span id={labelId} className="text-[15px] font-medium">
          {label}
        </span>
        {hint ? <Hint label={label}>{hint}</Hint> : null}
        {max !== undefined ? (
          <span className="ml-auto text-sm text-muted-foreground">
            {value.length} из {max}
          </span>
        ) : null}
      </div>
      {value.length ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((id) => {
            const p = byId[id];
            return (
              <li key={id} className="flex min-h-14 items-center gap-3 rounded-lg border bg-card px-2.5">
                {p ? <Thumb product={p} /> : <span className="size-10 rounded-md bg-muted" />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{p?.name ?? "Загружаем…"}</span>
                  {p ? <span className="text-xs text-muted-foreground">Остаток: {p.stock_label}</span> : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Убрать: ${p?.name ?? "товар"}`}
                  onClick={() => onChange(value.filter((v) => v !== id))}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">Пока ничего не выбрано.</p>
      )}
      <Button type="button" variant="outline" className="self-start" disabled={full} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Добавить товар
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[10%] translate-y-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>Найдите товар по названию</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput placeholder="Название товара" value={q} onValueChange={setQ} className="h-12 text-base" />
            <CommandList className="max-h-[60vh]">
              {search.isFetched && !options.length ? <CommandEmpty>Ничего не нашлось</CommandEmpty> : null}
              {options.map((p) => (
                <CommandItem key={p.id} value={p.id} onSelect={() => add(p)} className="gap-3 py-2.5">
                  <Thumb product={p} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Остаток: {p.stock_label}
                      {p.status !== "published" ? " · не на сайте" : ""}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
