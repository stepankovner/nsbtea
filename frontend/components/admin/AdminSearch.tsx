"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Schemas } from "@/lib/api/client";
import { adminSearch } from "@/lib/admin/search";
import { formatPhone, formatRub } from "@/lib/format";

type Result = Schemas["SearchOut"];

/** Быстрый поиск: товары, заказы (номер, телефон), клиенты (SPEC 10.1). Ctrl+K на ноутбуке. */
export function AdminSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; data: Result } | null>(null);
  const wanted = q.trim();
  const data = wanted && result?.q === wanted ? result.data : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      adminSearch(wanted).then(
        (found) => {
          if (!cancelled) setResult({ q: wanted, data: found });
        },
        () => undefined,
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const empty = data && !data.orders.length && !data.products.length && !data.customers.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 min-w-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-muted-foreground hover:text-foreground md:w-72"
      >
        <Search className="size-[18px]" aria-hidden="true" />
        <span className="hidden md:inline">Поиск</span>
        <span className="sr-only md:hidden">Поиск</span>
        <kbd className="ml-auto hidden rounded border px-1.5 text-xs md:inline">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[10%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Поиск</DialogTitle>
            <DialogDescription>Товары, заказы и клиенты</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="[&_[cmdk-input-wrapper]]:h-14">
            <CommandInput placeholder="Номер заказа, телефон, имя, товар…" value={q} onValueChange={setQ} className="h-12 text-base" />
            <CommandList className="max-h-[60vh]">
              {empty ? <CommandEmpty>Ничего не нашлось</CommandEmpty> : null}
              {!wanted ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Например: 10001 — номер заказа, 900 123 — часть телефона, «пуэр» — товар.
                </p>
              ) : null}
              {data?.orders.length ? (
                <CommandGroup heading="Заказы">
                  {data.orders.map((o) => (
                    <CommandItem key={o.id} value={`order-${o.id}`} onSelect={() => go(`/admin/orders/${o.id}`)} className="flex justify-between gap-3 py-3">
                      <span className="flex flex-col">
                        <span className="font-mono">{o.number}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.name} · {o.status_label}
                        </span>
                      </span>
                      <span className="text-sm">{formatRub(o.total_kop)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data?.products.length ? (
                <CommandGroup heading="Товары">
                  {data.products.map((p) => (
                    <CommandItem key={p.id} value={`product-${p.id}`} onSelect={() => go(`/admin/products/${p.id}`)} className="py-3">
                      {p.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {data?.customers.length ? (
                <CommandGroup heading="Клиенты">
                  {data.customers.map((c) => (
                    <CommandItem key={c.id} value={`customer-${c.id}`} onSelect={() => go(`/admin/customers/${c.id}`)} className="flex flex-col items-start py-3">
                      <span>{c.name ?? "Без имени"}</span>
                      <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        {c.email ? <span>{c.email}</span> : null}
                        {c.phone ? <span>{formatPhone(c.phone)}</span> : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
