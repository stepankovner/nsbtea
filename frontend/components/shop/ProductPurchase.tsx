"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatGrams, formatRub } from "@/lib/format";
import { shopApi } from "@/lib/shop-api";

import { useCart } from "./cart-context";
import { variantLabel } from "./TeaCard";
import { Stepper } from "./ui";

type Page = Schemas["ProductPage"];
type Kind = Schemas["CartItemIn"]["kind"];

const CUSTOM = "custom";
const MAX_QTY = 99;
const DEBOUNCE_MS = 400;

/** Ответ сервера по конкретному весу; пока вес в поле другой — значит, ждём новый ответ. */
interface CustomResult {
  grams: number;
  price: Schemas["CustomPriceOut"] | null;
  error: string | null;
}

function parseGrams(input: string): number | null {
  const grams = Number.parseInt(input, 10);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

function optionKey(kind: string, grams: number) {
  return `${kind}:${grams}`;
}

function optionTitle(option: Schemas["WeightOptionPublic"]): string {
  return option.kind === "cake" ? `Весь блин, ${formatGrams(option.grams)}` : formatGrams(option.grams);
}

export function ProductPurchase({ product }: { product: Page }) {
  const { add } = useCart();
  const isTea = product.type === "tea";
  const options = product.weight_options;
  const custom = product.custom_weight?.enabled ? product.custom_weight : null;

  const initialKey = useMemo(() => {
    const d = product.default_variant;
    if (d && options.some((o) => o.kind === d.kind && o.grams === d.grams && o.available)) {
      return optionKey(d.kind, d.grams);
    }
    const first = options.find((o) => o.available);
    if (first) return optionKey(first.kind, first.grams);
    return custom && product.in_stock ? CUSTOM : null;
  }, [product.default_variant, options, custom, product.in_stock]);

  const [selected, setSelected] = useState<string | null>(initialKey);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [customInput, setCustomInput] = useState(custom ? String(Math.max(custom.min, 50)) : "");
  const [customResult, setCustomResult] = useState<CustomResult | null>(null);
  const requestId = useRef(0);

  const isCustom = selected === CUSTOM;
  const option = options.find((o) => optionKey(o.kind, o.grams) === selected) ?? null;

  // Цена своего веса — с сервера, с задержкой на ввод
  const requestedGrams = isCustom ? parseGrams(customInput) : null;
  const customReady = customResult !== null && customResult.grams === requestedGrams;
  const customLoading = requestedGrams !== null && !customReady;
  useEffect(() => {
    if (requestedGrams === null) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      shopApi.customPrice(product.slug, requestedGrams).then(
        (price) => {
          if (id === requestId.current) setCustomResult({ grams: requestedGrams, price, error: null });
        },
        (error: unknown) => {
          if (id === requestId.current) {
            setCustomResult({ grams: requestedGrams, price: null, error: errorMessage(error) });
          }
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [requestedGrams, product.slug]);

  // Сколько пачек можно взять
  let grams = 0;
  let unitPrice: number | null = null;
  let unitOldPrice: number | null = null;
  let kind: Kind = "unit";
  if (!isTea) {
    unitPrice = product.price_kop;
    unitOldPrice = product.old_price_kop;
  } else if (option) {
    grams = option.grams;
    kind = option.kind as Kind;
    unitPrice = option.price_kop;
    unitOldPrice = option.old_price_kop;
  } else if (isCustom) {
    kind = "custom";
    const p = customReady ? customResult.price : null;
    if (p && p.available && p.price_kop !== null) {
      grams = p.grams;
      unitPrice = p.price_kop;
      unitOldPrice = p.old_price_kop;
    }
  }

  const maxQty = isTea
    ? grams > 0
      ? Math.min(MAX_QTY, Math.floor((product.available_grams ?? 0) / grams))
      : 1
    : Math.min(MAX_QTY, product.max_qty);
  // количество не больше доступного для выбранного веса (при смене веса уменьшается само)
  const safeQty = Math.max(1, Math.min(qty, Math.max(1, maxQty)));

  const canBuy = product.in_stock && unitPrice !== null && maxQty >= 1 && !busy;
  const customMessage =
    isCustom && customReady && !customLoading
      ? (customResult.error ?? (customResult.price && !customResult.price.available ? customResult.price.message : null))
      : null;

  async function onAdd() {
    if (unitPrice === null) return;
    setBusy(true);
    await add(
      { product_id: product.id, kind, grams: isTea ? grams : 0, qty: safeQty },
      variantLabel(product, grams, isTea ? kind : "unit"),
      { kop: unitPrice, name: product.name },
    );
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {isTea && (options.length > 0 || custom) ? (
        <div role="radiogroup" aria-label="Вес" className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const key = optionKey(o.kind, o.grams);
            const checked = selected === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={!o.available}
                onClick={() => setSelected(key)}
                className={clsx(
                  "flex min-w-[76px] flex-col items-center rounded-full border px-4 py-2.5 text-[15px] leading-tight transition-colors",
                  checked ? "border-ink bg-ink text-paper" : "border-ink bg-transparent text-ink hover:bg-block",
                  !o.available && "border-line text-muted line-through decoration-1 hover:bg-transparent",
                )}
              >
                <span>{optionTitle(o)}</span>
                {!o.available ? <span className="text-[11px] no-underline">нет в наличии</span> : null}
              </button>
            );
          })}
          {custom ? (
            <button
              type="button"
              role="radio"
              aria-checked={isCustom}
              onClick={() => setSelected(CUSTOM)}
              disabled={!product.in_stock}
              className={clsx(
                "min-w-[76px] rounded-full border px-4 py-2.5 text-[15px] transition-colors",
                isCustom ? "border-ink bg-ink text-paper" : "border-ink text-ink hover:bg-block",
                !product.in_stock && "border-line text-muted",
              )}
            >
              Свой вес
            </button>
          ) : null}
        </div>
      ) : null}

      {isCustom && custom ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="custom-grams" className="label-mono text-muted">
            Свой вес, г
          </label>
          <input
            id="custom-grams"
            type="number"
            inputMode="numeric"
            min={custom.min}
            step={custom.step}
            max={custom.max}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            aria-describedby="custom-grams-hint"
            className="w-40 rounded-none border-0 border-b border-ink bg-transparent py-2 text-lg outline-none"
          />
          <span id="custom-grams-hint" className={clsx("text-[13px]", customMessage ? "text-red" : "text-muted")}>
            {customMessage ??
              `От ${formatGrams(custom.min)}, шаг ${formatGrams(custom.step)}. Доступно ${formatGrams(custom.max)}.`}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Stepper value={safeQty} max={Math.max(1, maxQty)} onChange={setQty} testId="purchase-qty" disabled={!canBuy && !busy} />
        <span className="flex min-w-[130px] items-baseline gap-2.5">
          <span
            data-testid="purchase-total"
            className={clsx("font-serif text-[34px] leading-none", unitOldPrice ? "text-red" : "text-ink")}
          >
            {unitPrice !== null ? formatRub(unitPrice * safeQty) : "—"}
          </span>
          {unitPrice !== null && unitOldPrice ? (
            <s data-testid="purchase-old-total" className="text-base text-muted">
              {formatRub(unitOldPrice * safeQty)}
            </s>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canBuy}
          className="min-h-[52px] flex-[1_1_180px] rounded-full bg-ink px-7 py-4 text-base font-medium text-paper transition-colors hover:bg-red disabled:bg-muted disabled:hover:bg-muted"
        >
          {product.in_stock ? (busy ? "Кладём…" : "В корзину") : "Нет в наличии"}
        </button>
      </div>

      {product.price_per_gram_kop && isTea ? (
        <span className="-mt-3 font-mono text-xs text-muted">{formatRub(product.price_per_gram_kop)}/г</span>
      ) : null}
      {product.low_stock && product.in_stock ? <span className="text-sm text-red">Осталось мало</span> : null}
      {product.upcoming_thursday ? <span className="text-sm text-red">{product.upcoming_thursday}</span> : null}
    </div>
  );
}
