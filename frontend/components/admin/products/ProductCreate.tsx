"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageHeader, SectionCard } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/errors";
import { productKeys, productsApi, stepTitle, type ProductType } from "@/lib/admin/products";

import { CategorySelect, NameField, TypePicker, WizardSteps } from "./shared";

/**
 * Шаг 1 мастера для нового товара: тип, категория и название.
 * На «Далее» создаём черновик и уходим на адрес черновика (`/admin/products/{id}/edit?step=2`) —
 * дальше всё сохраняется само и переживает перезагрузку страницы.
 */
export function ProductCreate() {
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<ProductType>(params.get("type") === "unit" ? "unit" : "tea");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => productsApi.create({ type, name: name.trim(), category_id: categoryId }),
    onSuccess: (product) => {
      client.setQueryData(productKeys.detail(product.id), product);
      void client.invalidateQueries({ queryKey: productKeys.lists });
      router.replace(`/admin/products/${product.id}/edit?step=2`);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function next() {
    setError(null);
    if (!name.trim()) {
      setNameError("Напишите название");
      return;
    }
    create.mutate();
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        back={{ href: "/admin/products", label: "Все товары" }}
        title="Новый товар"
        description="7 коротких шагов. После первого шага черновик сохраняется сам — можно закрыть и продолжить позже, он будет во вкладке «Черновики»."
      />
      <WizardSteps step={1} maxStep={1} type={type} onGo={() => undefined} />
      <SectionCard title={stepTitle(1, type)} id="wizard-step">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <TypePicker value={type} onChange={setType} />
          <CategorySelect value={categoryId} onChange={setCategoryId} />
          <NameField
            value={name}
            onChange={(value) => {
              setName(value);
              if (value.trim()) setNameError(null);
            }}
            error={nameError}
          />
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={create.isPending}>
              {create.isPending ? "Создаём черновик…" : "Далее"}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
