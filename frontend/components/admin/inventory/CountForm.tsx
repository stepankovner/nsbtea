"use client";

import { inventoryApi, isTea, signedQty } from "@/lib/admin/inventory";
import { formatQty, plural } from "@/lib/format";

import { QtyWizard, type WizardConfig } from "./QtyWizard";

const config: WizardConfig = {
  title: "Инвентаризация",
  description:
    "Взвесьте или пересчитайте товар и введите, сколько его на самом деле. Если число не совпадёт с учётом, остаток исправится сам, а в истории появится запись с причиной.",
  rule: "count",
  pick: {
    title: "Какие товары пересчитали",
    label: "Товары",
    hint: "Добавьте только те товары, которые взвесили или пересчитали. Остатки остальных не изменятся.",
  },
  amounts: {
    title: "Сколько на самом деле",
    hint: "Введите, сколько лежит на полке сейчас: для чая — в целых граммах (например, 120), для посуды и наборов — в штуках. Если ничего не осталось — 0.",
    fieldHint: (type) =>
      isTea(type)
        ? "Сколько граммов этого чая на самом деле — вместе со вскрытыми пачками. Целое число, например 120. Если ничего не осталось — 0."
        : "Сколько штук на самом деле, например 4. Если ничего не осталось — 0.",
    describe: (info, check) => {
      const base = `По учёту: ${formatQty(info.type, info.stock)}`;
      if (check.value === null) return base;
      const delta = check.value - info.stock;
      return delta === 0 ? `${base} · совпадает, без изменений` : `${base} · Разница: ${signedQty(info.type, delta)}`;
    },
  },
  after: (_before, value) => value,
  comment: {
    label: "Причина расхождения",
    hint: "Необязательно. Почему остаток не совпал — увидите в истории. Например: «рассыпали при фасовке» или «нашлась пачка на витрине».",
    placeholder: "Например, рассыпали при фасовке",
  },
  review: {
    title: "Проверьте и проведите",
    note: (lines) => {
      const changed = lines.filter((l) => l.after !== l.before).length;
      if (!changed) return "Расхождений нет — остатки не изменятся.";
      const same = lines.length - changed;
      return `Исправим остаток у ${changed} ${plural(changed, "товара", "товаров", "товаров")}${
        same ? `, у ${same} ${plural(same, "товара", "товаров", "товаров")} — без изменений` : ""
      }. Остаток станет ровно таким, как вы ввели. Если число неверное — нажмите «Назад» и поправьте.`;
    },
    submit: "Провести инвентаризацию",
  },
  onSubmit: async (lines, comment) => {
    const result = await inventoryApi.count({ comment, lines: lines.map((l) => ({ product_id: l.id, actual: l.value })) });
    return result.changed
      ? `Инвентаризация проведена: исправлен остаток у ${result.changed} ${plural(result.changed, "товара", "товаров", "товаров")}`
      : "Инвентаризация проведена: расхождений нет, остатки не изменились";
  },
};

/** «Инвентаризация» — фактический остаток, сервер сам создаёт корректировку на разницу (SPEC 10.4). */
export function CountForm() {
  return <QtyWizard config={config} />;
}
