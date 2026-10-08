"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Package, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { MoneyField } from "@/components/admin/MoneyField";
import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/errors";
import { categoryOptions } from "@/lib/admin/categories";
import {
  packPriceKop,
  pricePerGramFromInput,
  PRODUCT_TABS,
  productKeys,
  productsApi,
  productState,
  type PriceBase,
  type ProductListItem,
  type ProductsQuery,
} from "@/lib/admin/products";
import { formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

import { NativeSelect } from "./inputs";
import { PRODUCT_STATE_TONES, PriceBasePicker, ProductThumb, useCategories } from "./shared";

const PER_PAGE = 30;

/** Быстрая правка цены прямо из списка (SPEC 10.3). */
function QuickPriceDialog({ item, onClose }: { item: ProductListItem; onClose: () => void }) {
  const client = useQueryClient();
  const isTea = item.type === "tea";
  const [base, setBase] = useState<PriceBase>(50);
  const [amount, setAmount] = useState<number | null>(isTea ? (item.price_per_gram_kop ? item.price_per_gram_kop * 50 : null) : item.unit_price_kop);
  const [error, setError] = useState<string | null>(null);
  const ppg = isTea && amount ? pricePerGramFromInput(amount, base) : null;

  const mutation = useMutation({
    mutationFn: () =>
      productsApi.patch(item.id, isTea ? { price: { amount_kop: amount!, per_grams: base } } : { unit_price_kop: amount }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: productKeys.lists });
      void client.invalidateQueries({ queryKey: productKeys.detail(item.id) });
      toast.success("Цена сохранена");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Цена: {item.name}</DialogTitle>
          <DialogDescription>
            {isTea
              ? "Укажите цену за удобный вес — цену каждой фасовки посчитаем сами и округлим до рубля."
              : "Цена за одну штуку. На сайте поменяется сразу после сохранения."}
          </DialogDescription>
        </DialogHeader>
        {isTea ? (
          <PriceBasePicker
            value={base}
            onChange={(next) => {
              if (amount) setAmount(pricePerGramFromInput(amount, base) * next);
              setBase(next);
            }}
          />
        ) : null}
        <MoneyField
          label={isTea ? `Цена за ${base} г` : "Цена за штуку"}
          value={amount}
          onChange={setAmount}
          description={ppg ? `Это ${formatRub(ppg)} за 1 г · 50 г — ${formatRub(packPriceKop(50, ppg))}` : undefined}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!amount || mutation.isPending}>
            Сохранить цену
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductRow({ item, onPrice }: { item: ProductListItem; onPrice: (item: ProductListItem) => void }) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const state = productState(item);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: productKeys.lists });
    void client.invalidateQueries({ queryKey: productKeys.detail(item.id) });
  };
  const visibility = useMutation({
    mutationFn: (on: boolean) => (on ? productsApi.publish(item.id) : productsApi.hide(item.id)),
    onSuccess: (_, on) => {
      setError(null);
      toast.success(on ? "Товар показан на сайте" : "Товар скрыт с сайта");
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: () => productsApi.restore(item.id),
    onSuccess: () => {
      toast.success("Товар восстановлен. Он пока скрыт с сайта — покажите, когда будете готовы.");
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const published = visibility.isPending ? visibility.variables === true : state === "published";

  return (
    <li className="border-b last:border-b-0">
      <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:gap-4">
        <Link href={`/admin/products/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:underline">
          <ProductThumb src={item.image_url} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium md:truncate">{item.name}</span>
            <span className="text-sm text-muted-foreground">{item.category_name ?? "Без категории"}</span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 md:w-72 md:flex-col md:items-start md:gap-1">
          <span className="text-[15px] tabular-nums">{item.price_label}</span>
          <span
            className={cn(
              "text-sm tabular-nums",
              item.stock_level === "out" ? "text-red-700" : item.stock_level === "low" ? "text-amber-800" : "text-muted-foreground",
            )}
          >
            {`Остаток: ${item.stock_label}${item.stock_level === "low" ? " · мало" : ""}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:w-[300px] md:justify-end">
          <StatusBadge tone={PRODUCT_STATE_TONES[state]}>{item.status_label}</StatusBadge>
          {state === "archived" ? (
            <Button variant="outline" aria-label={`Восстановить: ${item.name}`} disabled={restore.isPending} onClick={() => restore.mutate()}>
              Восстановить
            </Button>
          ) : (
            <>
              <Button variant="outline" aria-label={`Изменить цену: ${item.name}`} onClick={() => onPrice(item)}>
                Изменить цену
              </Button>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={published}
                  disabled={visibility.isPending}
                  onCheckedChange={(on) => visibility.mutate(on)}
                  aria-label={`На сайте: ${item.name}`}
                />
                <span aria-hidden="true">на сайте</span>
              </label>
            </>
          )}
        </div>
      </div>
      {error ? (
        <div role="alert" className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span>{error}</span>
          <Link href={`/admin/products/${item.id}`} className="font-medium underline underline-offset-2">
            Заполнить
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export function ProductsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const categoryId = useId();
  const stockId = useId();
  const typeId = useId();
  const status = params.get("status");
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const stock = params.get("stock") ?? "";
  const type = params.get("type") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const [text, setText] = useState(q);
  const [priceItem, setPriceItem] = useState<ProductListItem | null>(null);
  const categories = useCategories();

  const query: ProductsQuery = {
    q: q || undefined,
    status: status && status !== "archived" ? status : undefined,
    archived: status === "archived" ? true : undefined,
    category_id: category || undefined,
    stock: stock || undefined,
    type: type || undefined,
    page,
    per_page: PER_PAGE,
  };
  const list = useQuery({ queryKey: productKeys.list(query), queryFn: () => productsApi.list(query) });

  function href(change: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in change)) next.delete("page");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    router.replace(href({ q: text.trim() || null }));
  }

  const filtered = Boolean(q || category || stock || type || (status && status !== "archived"));

  return (
    <>
      <PageHeader
        title="Товары"
        description="Чай, посуда и наборы. Нажмите на товар, чтобы изменить его. Цену и показ на сайте можно поменять прямо здесь."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/products/categories">
                <FolderTree aria-hidden="true" />
                Категории
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/admin/products/new">
                <Plus aria-hidden="true" />
                Добавить товар
              </Link>
            </Button>
          </>
        }
      />

      <form role="search" onSubmit={onSearch} className="mb-3 flex gap-2">
        <Input
          type="search"
          aria-label="Поиск товаров"
          placeholder="Название или слово для поиска"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          Найти
        </Button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:max-w-3xl">
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={categoryId} className="text-sm text-muted-foreground">
            Категория
          </label>
          <NativeSelect id={categoryId} value={category} onChange={(e) => router.replace(href({ category: e.target.value || null }))}>
            <option value="">Все категории</option>
            {categoryOptions(categories.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.depth ? `— ${o.name}` : o.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={typeId} className="text-sm text-muted-foreground">
            Тип
          </label>
          <NativeSelect id={typeId} value={type} onChange={(e) => router.replace(href({ type: e.target.value || null }))}>
            <option value="">Все</option>
            <option value="tea">Чай на развес</option>
            <option value="unit">Посуда и наборы</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={stockId} className="text-sm text-muted-foreground">
            Остаток
          </label>
          <NativeSelect id={stockId} value={stock} onChange={(e) => router.replace(href({ stock: e.target.value || null }))}>
            <option value="">Любой</option>
            <option value="low">Заканчивается</option>
            <option value="out">Нет в наличии</option>
          </NativeSelect>
        </div>
      </div>

      <nav aria-label="Статус товаров" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PRODUCT_TABS.map((tab) => {
          const active = (status ?? null) === tab.value;
          return (
            <Link
              key={tab.label}
              href={href({ status: tab.value })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <QueryState query={list}>
        {(data) =>
          data.items.length ? (
            <>
              <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                {data.items.map((item) => (
                  <ProductRow key={item.id} item={item} onPrice={setPriceItem} />
                ))}
              </ul>
              {data.total > PER_PAGE ? (
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button asChild variant="outline" disabled={page <= 1}>
                    <Link href={href({ page: String(page - 1) })} aria-disabled={page <= 1}>
                      Назад
                    </Link>
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Страница {page} из {Math.ceil(data.total / PER_PAGE)}
                  </span>
                  <Button asChild variant="outline">
                    <Link href={href({ page: String(page + 1) })} aria-disabled={page * PER_PAGE >= data.total}>
                      Дальше
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : filtered ? (
            <EmptyState icon={Package} title="Ничего не нашлось">
              Попробуйте другую вкладку, категорию или уберите поиск.
            </EmptyState>
          ) : status === "archived" ? (
            <EmptyState icon={Package} title="В архиве пусто">
              Сюда попадают товары, которые вы убрали в архив из карточки товара. Их можно восстановить.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Package}
              title="Пока нет товаров"
              action={
                <Button asChild size="lg">
                  <Link href="/admin/products/new">Добавить первый товар</Link>
                </Button>
              }
            >
              Нажмите «Добавить товар» — мы проведём по шагам: тип, описание, фото, цена. Черновик сохраняется сам, можно продолжить позже.
            </EmptyState>
          )
        }
      </QueryState>

      {priceItem ? <QuickPriceDialog key={priceItem.id} item={priceItem} onClose={() => setPriceItem(null)} /> : null}
    </>
  );
}
