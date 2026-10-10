"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatGrams, formatRub, plural } from "@/lib/format";
import { ecommerce } from "@/lib/metrika";
import { shopApi, type Cart } from "@/lib/shop-api";

import { useCart } from "../cart-context";
import { tileColors } from "../tile";
import { buttonClass, Stepper } from "../ui";

type Line = Schemas["CartLineOut"];

function lineVariant(line: Line): string | null {
  if (line.type !== "tea") return null;
  if (line.variant_kind === "cake") return `Весь блин, ${formatGrams(line.grams)}`;
  return formatGrams(line.grams);
}

function CartLine({ line, onChange }: { line: Line; onChange: (next: Promise<Cart>) => void }) {
  const colors = tileColors(line.tile_color);
  const variant = lineVariant(line);
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-line py-[22px]">
      <Link
        href={`/product/${line.slug}`}
        aria-hidden="true"
        tabIndex={-1}
        className="relative flex h-[90px] w-[72px] flex-none items-start justify-end overflow-hidden p-2.5"
        style={{ background: colors.bg, color: colors.fg }}
      >
        {line.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- миниатюра от сервера
          <img src={line.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : line.hanzi ? (
          <span lang="zh-Hans" className="hanzi-vertical text-lg">{line.hanzi}</span>
        ) : null}
      </Link>
      <div className="flex min-w-[180px] flex-[1_1_180px] flex-col gap-1.5">
        <Link href={`/product/${line.slug}`} className="font-serif text-2xl leading-tight hover:text-red">
          {line.name}
        </Link>
        <span className="flex flex-wrap gap-x-2 font-mono text-xs text-muted">
          {variant ? <span>{variant}</span> : null}
          {variant ? <span aria-hidden="true">·</span> : null}
          <span>{formatRub(line.unit_price_kop)} за {line.type === "tea" ? "пачку" : "шт."}</span>
        </span>
        {line.promotion_label ? <span className="text-[13px] text-red">{line.promotion_label}</span> : null}
        {line.problem ? <span className="text-[13px] text-red">{line.problem}</span> : null}
      </div>
      <Stepper
        value={line.qty}
        max={Math.max(line.qty, line.max_qty)}
        shape="square"
        size="sm"
        decreaseLabel={`Меньше: ${line.name}`}
        increaseLabel={`Больше: ${line.name}`}
        onChange={(qty) => onChange(shopApi.updateLine(line.id, { qty }))}
      />
      <span className="flex min-w-[100px] flex-col items-end text-right">
        <span className="text-[17px] font-medium">{formatRub(line.total_kop)}</span>
        {line.product_discount_kop > 0 ? (
          <s className="text-[13px] text-muted">{formatRub(line.line_total_kop)}</s>
        ) : null}
      </span>
      <button
        type="button"
        aria-label={`Убрать: ${line.name}`}
        onClick={() => {
          ecommerce("remove", [{ id: line.product_id, name: line.name, price: line.unit_price_kop / 100, quantity: line.qty }]);
          onChange(shopApi.removeLine(line.id));
        }}
        className="p-1 text-sm text-muted hover:text-red"
      >
        Убрать
      </button>
    </li>
  );
}

function PromoCode({ cart, run }: { cart: Cart; run: (next: Promise<Cart>) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  const promo = cart.promo_code;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    if (await run(shopApi.applyPromo(code.trim()))) setCode("");
  }

  if (promo?.applied) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-[15px]">
        <span>
          Промокод <b className="font-medium">{promo.code}</b> применён
        </span>
        <button type="button" className="text-sm text-muted underline hover:text-red" onClick={() => run(shopApi.removePromo())}>
          Убрать промокод
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="promo-code" className="label-mono text-muted">
            Промокод
          </label>
          <input
            id="promo-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="w-full rounded-none border-0 border-b border-ink bg-transparent py-2.5 text-base uppercase outline-none"
          />
        </div>
        <button type="submit" className={buttonClass("pill-outline")}>
          Применить
        </button>
      </div>
      {promo && !promo.applied && promo.message ? <span className="text-[13px] text-red">{promo.message}</span> : null}
    </form>
  );
}

function Points({ cart, loggedIn, run }: { cart: Cart; loggedIn: boolean; run: (next: Promise<Cart>) => Promise<boolean> }) {
  const points = cart.points;
  const [value, setValue] = useState(String(points.requested || ""));
  if (!loggedIn) {
    return (
      <p className="text-[15px] text-text2">
        <Link href="/account/login?next=/cart" className="text-red underline underline-offset-2">
          Войдите, чтобы списать баллы
        </Link>{" "}
        — 1 балл = 1 ₽, до половины стоимости товаров.
      </p>
    );
  }
  if (!points.enabled) return null;
  if (points.balance <= 0) {
    return <p className="text-[15px] text-text2">Баллов пока нет — они придут после первого выполненного заказа.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px]">На счёте {points.balance} {plural(points.balance, "балл", "балла", "баллов")}</span>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="points" className="label-mono text-muted">
            Списать баллов
          </label>
          <input
            id="points"
            type="number"
            inputMode="numeric"
            min={0}
            max={points.max_spend}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              const n = Math.max(0, Number.parseInt(value || "0", 10) || 0);
              if (n !== points.requested) void run(shopApi.setPoints({ points: n }));
            }}
            className="w-28 rounded-none border-0 border-b border-ink bg-transparent py-2 text-base outline-none"
          />
        </div>
        <button type="button" className={buttonClass("pill-outline")} onClick={() => run(shopApi.setPoints({ max: true }))}>
          Списать максимум
        </button>
        {points.applied > 0 ? (
          <button type="button" className="text-sm text-muted underline" onClick={() => run(shopApi.setPoints({ points: 0 }))}>
            Не списывать
          </button>
        ) : null}
      </div>
      <span className="text-[13px] text-muted">
        Можно списать до {points.max_spend} {plural(points.max_spend, "балла", "баллов", "баллов")} в этом заказе.
      </span>
    </div>
  );
}

function SummaryRow({ label, value, testId, accent }: { label: string; value: string; testId?: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span data-testid={testId} className={clsx(accent && "text-red")}>
        {value}
      </span>
    </div>
  );
}

export function CartSummary({ cart }: { cart: Cart }) {
  return (
    <div className="flex flex-col gap-2.5 text-[15px]">
      <SummaryRow label="Товары" value={formatRub(cart.items_total_kop)} />
      {cart.product_discount_kop > 0 ? (
        <SummaryRow label="Скидка на товары" value={formatRub(-cart.product_discount_kop)} testId="summary-product-discount" accent />
      ) : null}
      {cart.order_discount_kop > 0 ? (
        <SummaryRow
          label={cart.order_discount_label ?? "Скидка на заказ"}
          value={formatRub(-cart.order_discount_kop)}
          testId="summary-order-discount"
          accent
        />
      ) : null}
      {cart.points.applied > 0 ? (
        <SummaryRow label="Баллами" value={formatRub(-cart.points.applied * 100)} testId="summary-points" accent />
      ) : null}
      <div className="flex items-baseline justify-between pt-2">
        <span className="text-[17px]">Итого без доставки</span>
        <span data-testid="summary-total" className="font-serif text-[30px]">
          {formatRub(cart.total_without_delivery_kop)}
        </span>
      </div>
      {cart.points_to_earn > 0 ? (
        <span className="text-[13px] text-green">
          Будет начислено {cart.points_to_earn} {plural(cart.points_to_earn, "балл", "балла", "баллов")}
        </span>
      ) : null}
    </div>
  );
}

export function CartView({ loggedIn }: { loggedIn: boolean }) {
  const { cart, setCart } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(next: Promise<Cart>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      setCart(await next);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  }

  if (!cart) return <p className="py-10 text-muted">Загружаем корзину…</p>;

  if (!cart.lines.length) {
    return (
      <div className="flex flex-col items-start gap-6 border-t border-ink py-10">
        <span className="text-lg text-text2">Пока пусто.</span>
        <Link href="/catalog" className={buttonClass("primary")}>
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-8", pending && "opacity-80")} aria-busy={pending}>
      <ul className="border-t border-ink">
        {cart.lines.map((line) => (
          <CartLine key={line.id} line={line} onChange={(p) => void run(p)} />
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
      {cart.problems.length ? (
        <ul className="flex flex-col gap-1 text-[15px] text-red">
          {cart.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <PromoCode cart={cart} run={run} />
          <Points cart={cart} loggedIn={loggedIn} run={run} />
          {cart.welcome?.tentative ? (
            <p className="text-[15px] text-green">−{cart.welcome.percent}% на первый заказ</p>
          ) : null}
          {cart.notes.length ? (
            <ul className="flex flex-col gap-1 text-[13px] text-muted">
              {cart.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <CartSummary cart={cart} />
      </div>
    </div>
  );
}
