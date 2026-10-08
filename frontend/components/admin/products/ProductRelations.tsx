"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ProductPicker } from "@/components/admin/ProductPicker";
import { errorMessage } from "@/lib/api/errors";
import { productKeys, productsApi, type AdminProduct, type RelationKind } from "@/lib/admin/products";

interface RelationInfo {
  kind: RelationKind;
  label: string;
  max: number;
  hint: string;
}

/** Ограничения — как на сервере (catalog_admin.MAX_RELATIONS). */
function relationsFor(type: string): RelationInfo[] {
  const goesWith: RelationInfo = {
    kind: "goes_with",
    label: type === "tea" ? "Подойдёт к этому чаю" : "Подойдёт к этому товару",
    max: 8,
    hint: "Посуда и наборы, которые стоит купить вместе, например гайвань или чахай. Если ничего не выбрать — этого блока на сайте не будет.",
  };
  const similar: RelationInfo = {
    kind: "similar_pinned",
    label: type === "tea" ? "Похожие чаи" : "Похожие товары",
    max: 4,
    hint: "До 4 товаров. Если ничего не выбрать, сайт подберёт сам: та же категория и больше всего общих вкусовых нот. Например, к Да Хун Пао — другие утёсные улуны.",
  };
  if (type === "tea") return [similar, goesWith];
  return [
    {
      kind: "set_contains",
      label: "Состав набора",
      max: 20,
      hint: "Только для наборов: какие чаи в него входят — на сайте будут ссылки на них. Остатки этих чаев набор не списывает: сколько наборов в наличии — отдельно, на складе.",
    },
    goesWith,
    similar,
  ];
}

/** Связанные товары: сохраняются сразу при выборе. */
export function ProductRelations({ product }: { product: AdminProduct }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ kind, ids }: { kind: RelationKind; ids: string[] }) => productsApi.setRelations(product.id, kind, ids),
    onSuccess: (next) => {
      client.setQueryData(productKeys.detail(product.id), next);
      toast.success("Сохранено");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Выбор сохраняется сразу.</p>
      {relationsFor(product.type).map((r) => (
        <ProductPicker
          key={r.kind}
          label={r.label}
          hint={r.hint}
          max={r.max}
          exclude={[product.id]}
          value={(product.relations[r.kind] ?? []).map((p) => p.id)}
          onChange={(ids) => mutation.mutate({ kind: r.kind, ids })}
        />
      ))}
    </div>
  );
}
