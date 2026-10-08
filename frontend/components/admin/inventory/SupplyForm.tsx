"use client";

import { inventoryApi, isTea } from "@/lib/admin/inventory";
import { formatQty, plural } from "@/lib/format";

import { QtyWizard, type WizardConfig } from "./QtyWizard";

function totals(lines: { type: string; value: number }[]): string {
  const grams = lines.filter((l) => isTea(l.type)).reduce((sum, l) => sum + l.value, 0);
  const units = lines.filter((l) => !isTea(l.type)).reduce((sum, l) => sum + l.value, 0);
  const parts = [grams ? `${formatQty("tea", grams)} чая` : null, units ? formatQty("unit", units) : null].filter(Boolean);
  return parts.join(" и ");
}

const config: WizardConfig = {
  title: "Принять поставку",
  description: "Пришёл товар — добавьте его на склад: остатки увеличатся, а в истории останется запись о поставке.",
  rule: "supply",
  pick: {
    title: "Что пришло",
    label: "Товары из поставки",
    hint: "Найдите товар по названию и добавьте. Можно сразу несколько — например, все чаи от одного поставщика.",
  },
  amounts: {
    title: "Сколько пришло",
    hint: "Для чая — целые граммы (например, 500; если пришло 2 кг — введите 2000). Для посуды и наборов — целые штуки, например 3.",
    fieldHint: (type) =>
      isTea(type)
        ? "Сколько граммов пришло — целым числом, без дробей. Например, 500. 1 кг = 1000 г."
        : "Сколько штук пришло — целым числом. Например, 3.",
    describe: (info, check) =>
      check.value !== null
        ? `Сейчас ${formatQty(info.type, info.stock)} → станет ${formatQty(info.type, info.stock + check.value)}`
        : `Сейчас на складе: ${formatQty(info.type, info.stock)}`,
  },
  after: (before, value) => before + value,
  comment: {
    label: "Поставщик или комментарий",
    hint: "Необязательно. Увидите в истории поставок. Например: «Поставщик Ли, весенний сбор 2026».",
    placeholder: "Например, поставщик Ли",
  },
  review: {
    title: "Проверьте и проведите",
    note: (lines) => (
      <>
        Остатки увеличатся у {lines.length} {plural(lines.length, "товара", "товаров", "товаров")}
        {totals(lines) ? ` — всего ${totals(lines)}` : ""}. Если число неверное — нажмите «Назад» и поправьте.
      </>
    ),
    submit: "Провести поставку",
  },
  onSubmit: async (lines, comment) => {
    await inventoryApi.postSupply({ comment, lines: lines.map((l) => ({ product_id: l.id, qty: l.value })) });
    return `Поставка проведена: ${lines.length} ${plural(lines.length, "товар", "товара", "товаров")}, остатки обновлены`;
  },
};

/** «Принять поставку» — главный сценарий склада, удобный с телефона (SPEC 10.4). */
export function SupplyForm() {
  return <QtyWizard config={config} />;
}
