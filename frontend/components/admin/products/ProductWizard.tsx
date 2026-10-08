"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader, QueryState, SectionCard } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { findCategory } from "@/lib/admin/categories";
import {
  fieldStep,
  PRODUCT_TYPE_LABELS,
  problemSteps,
  problemsInMessage,
  productKeys,
  productsApi,
  stepTitle,
  WIZARD_STEP_COUNT,
  type AdminProduct,
} from "@/lib/admin/products";
import { errorMessage } from "@/lib/api/errors";

import {
  BrewingFields,
  CharacteristicsFields,
  DescriptionFields,
  SearchAliasesField,
  SeoFields,
  SlugField,
  TeaPriceFields,
  UnitPriceFields,
} from "./fields";
import { ProductPhotos } from "./ProductPhotos";
import { ProductPreview } from "./ProductPreview";
import { ProductRelations } from "./ProductRelations";
import { CategorySelect, NameField, useCategories, WizardSteps } from "./shared";
import { useProductForm } from "./useProductForm";

function clampStep(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= WIZARD_STEP_COUNT ? n : 2;
}

function WizardView({ product, autosaveDelay }: { product: AdminProduct; autosaveDelay?: number }) {
  const client = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const categories = useCategories();
  const isDraft = product.status === "draft" && !product.archived_at;
  const state = useProductForm(product, { autosave: isDraft, delay: autosaveDelay });
  const { form, update, errors } = state;
  const [step, setStep] = useState(() => clampStep(params.get("step")));
  const [maxStep, setMaxStep] = useState(step);
  const [stepError, setStepError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const type = form.type;

  function go(n: number) {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
    setStepError(null);
    router.replace(`/admin/products/${product.id}/edit?step=${n}`);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({ top: 0 });
      } catch {
        // в тестовом окружении прокрутки нет
      }
    }
  }

  /** Сохранить всё, что ещё не ушло на сервер. false — если сохранить нельзя (ошибка уже на экране). */
  async function saveAll(): Promise<boolean> {
    if (!state.valid) {
      const where = Object.keys(errors)
        .map(fieldStep)
        .filter((s): s is number => s !== null && s !== step);
      setStepError(
        where.length
          ? `Проверьте шаг ${where[0]} «${stepTitle(where[0]!, type)}» — там есть ошибка.`
          : "Исправьте отмеченные поля — тогда сохраним и пойдём дальше.",
      );
      return false;
    }
    try {
      await state.saveNow();
      return true;
    } catch {
      return false;
    }
  }

  async function next() {
    if (await saveAll()) go(step + 1);
  }

  const publish = useMutation({
    mutationFn: () => productsApi.publish(product.id),
    onSuccess: (next) => {
      client.setQueryData(productKeys.detail(product.id), next);
      void client.invalidateQueries({ queryKey: productKeys.lists });
      toast.success("Товар показан на сайте");
      router.push(`/admin/products/${product.id}`);
    },
    onError: (e) => setPublishError(errorMessage(e)),
  });

  async function onPublish() {
    setPublishError(null);
    if (await saveAll()) publish.mutate();
  }

  async function finish() {
    if (await saveAll()) {
      toast.success(isDraft ? "Черновик сохранён — он во вкладке «Черновики»" : "Сохранено");
      router.push(`/admin/products/${product.id}`);
    }
  }

  const published = product.status === "published" && !product.archived_at;

  const problems = [...new Set([...product.publish_problems, ...problemsInMessage(publishError ?? "")])];
  const fixes = problemSteps(problems, type);
  const category = findCategory(categories.data ?? [], form.category_id);

  let body: ReactNode;
  switch (step) {
    case 1:
      body = (
        <div className="flex flex-col gap-5">
          <p className="rounded-lg bg-muted px-3 py-2.5 text-[15px]">
            Тип: <strong>{PRODUCT_TYPE_LABELS[type]}</strong>. Поменять тип нельзя — для другого типа создайте новый товар.
          </p>
          <CategorySelect value={form.category_id} onChange={(category_id) => update({ category_id })} error={errors.category_id} />
          <NameField value={form.name} onChange={(name) => update({ name })} error={errors.name} />
        </div>
      );
      break;
    case 2:
      body = <DescriptionFields form={form} update={update} errors={errors} />;
      break;
    case 3:
      body = <ProductPhotos product={product} />;
      break;
    case 4:
      body =
        type === "tea" ? (
          <TeaPriceFields form={form} update={update} errors={errors} productId={product.id} />
        ) : (
          <UnitPriceFields form={form} update={update} errors={errors} productId={product.id} />
        );
      break;
    case 5:
      body =
        type === "tea" ? (
          <div className="flex flex-col gap-8">
            <CharacteristicsFields form={form} update={update} errors={errors} />
            <div className="flex flex-col gap-3">
              <h3 className="text-base font-semibold">Как заварить</h3>
              <BrewingFields form={form} update={update} errors={errors} />
            </div>
            <SearchAliasesField form={form} update={update} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">Для посуды и наборов характеристики чая не нужны. Добавьте, как ещё могут искать этот товар.</p>
            <SearchAliasesField form={form} update={update} />
          </div>
        );
      break;
    case 6:
      body = <ProductRelations product={product} />;
      break;
    default:
      body = (
        <div className="flex flex-col gap-6">
          <ProductPreview form={form} product={product} categoryName={category?.name ?? product.category?.name} tileColor={category?.tile_color} />
          <div className="flex flex-col gap-4">
            <SlugField form={form} update={update} errors={errors} />
            <details className="rounded-lg border px-3 py-2">
              <summary className="min-h-9 cursor-pointer py-1.5 text-[15px] font-medium">Для поисковиков (необязательно)</summary>
              <div className="pt-3">
                <SeoFields form={form} update={update} errors={errors} />
              </div>
            </details>
          </div>
          {publishError || fixes.length ? (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              {publishError ? (
                <p role="alert" className="font-medium">
                  {publishError}
                </p>
              ) : (
                <p className="font-medium">Чтобы показать товар на сайте, заполните: {problems.join(", ")}.</p>
              )}
              {fixes.length ? (
                <div className="flex flex-wrap gap-2">
                  {fixes.map((f) => (
                    <Button key={f.problem} variant="outline" className="h-auto min-h-11 whitespace-normal py-2 text-left" onClick={() => go(f.step)}>
                      Перейти к шагу {f.step}: {f.title}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        back={{ href: "/admin/products", label: "Все товары" }}
        title={form.name.trim() || "Новый товар"}
        description={
          isDraft
            ? "Черновик — сохраняется сам. Можно закрыть и вернуться позже: он будет во вкладке «Черновики»."
            : "Изменения сохраняются, когда вы переходите к следующему шагу."
        }
      />
      <WizardSteps step={step} maxStep={maxStep} type={type} onGo={go} status={state.statusLabel} />
      <SectionCard title={stepTitle(step, type)} id="wizard-step">
        {body}
      </SectionCard>

      {stepError || (state.error && state.status === "error") ? (
        <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {stepError ?? state.error}
        </p>
      ) : null}

      {step < WIZARD_STEP_COUNT ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-20 mt-5 flex items-center gap-2 rounded-xl border bg-background/95 p-2 backdrop-blur lg:bottom-4">
          {step > 1 ? (
            <Button type="button" variant="outline" size="lg" onClick={() => go(step - 1)}>
              <ArrowLeft aria-hidden="true" />
              Назад
            </Button>
          ) : null}
          <Button type="button" size="lg" className="ml-auto" onClick={() => void next()} disabled={state.saving}>
            Далее
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      ) : (
        // последний шаг: на телефоне кнопки друг под другом во всю ширину, главная — внизу, под пальцем
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => go(step - 1)}>
            <ArrowLeft aria-hidden="true" />
            Назад
          </Button>
          <Button
            type="button"
            variant={published ? "default" : "outline"}
            size="lg"
            className="w-full sm:ml-auto sm:w-auto"
            onClick={() => void finish()}
            disabled={state.saving || publish.isPending}
          >
            {isDraft ? "Оставить черновиком" : "Сохранить и выйти"}
          </Button>
          {published ? null : (
            <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => void onPublish()} disabled={state.saving || publish.isPending}>
              Показать на сайте
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Пошаговое заполнение товара (SPEC 10.3): шаг — в адресе (`?step=N`), чтобы пережить перезагрузку. */
export function ProductWizard({ id, autosaveDelay }: { id: string; autosaveDelay?: number }) {
  const query = useQuery({ queryKey: productKeys.detail(id), queryFn: () => productsApi.get(id) });
  return (
    <QueryState query={query} skeleton={5}>
      {(product) => <WizardView key={product.id} product={product} autosaveDelay={autosaveDelay} />}
    </QueryState>
  );
}
