"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Eye, ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { findCategory } from "@/lib/admin/categories";
import {
  PRODUCT_TYPE_LABELS,
  problemSteps,
  problemsInMessage,
  productKeys,
  productsApi,
  productState,
  SECTION_IDS,
  stepTitle,
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
import { NumberField } from "./inputs";
import { ProductPhotos } from "./ProductPhotos";
import { ProductPreview } from "./ProductPreview";
import { ProductRelations } from "./ProductRelations";
import { CategorySelect, PRODUCT_STATE_TONES, useCategories } from "./shared";
import { useProductForm, type ProductFormState } from "./useProductForm";

function StockSection({ product, state }: { product: AdminProduct; state: ProductFormState }) {
  const isTea = product.type === "tea";
  const unit = isTea ? "г" : "шт.";
  const general = product.low_stock_threshold === null ? product.effective_threshold : isTea ? 50 : 2;
  const level = product.stock <= 0 ? "out" : product.stock <= product.effective_threshold ? "low" : "ok";
  return (
    <SectionCard title="Остаток" id="product-stock" className="order-4 lg:order-none">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-3xl font-semibold tabular-nums">{product.stock_label}</span>
          {level === "out" ? (
            <StatusBadge tone="danger">Нет в наличии</StatusBadge>
          ) : level === "low" ? (
            <StatusBadge tone="warning">Осталось мало</StatusBadge>
          ) : (
            <StatusBadge tone="success">В наличии</StatusBadge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Остаток меняется только на складе — поставкой, списанием или инвентаризацией. Так история движения всегда точная.
        </p>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/admin/inventory?product=${product.id}`}>Изменить остаток на складе</Link>
        </Button>
        <NumberField
          label={`Порог «Осталось мало», ${unit}`}
          value={state.form.low_stock_threshold}
          onChange={(low_stock_threshold) => state.update({ low_stock_threshold })}
          placeholder={String(general)}
          suffix={unit}
          error={state.errors.low_stock_threshold}
          hint={`Когда остаток станет таким или меньше, на сайте появится «Осталось мало», а вам придёт сообщение в Telegram. Например, для редкого чая — 100 г. Пусто — общий порог из настроек: ${general} ${unit}`}
          description={
            state.form.low_stock_threshold === null ? `Пусто — общий порог: ${general} ${unit}` : "Свой порог для этого товара"
          }
        />
      </div>
    </SectionCard>
  );
}

function EditorView({ product, autosaveDelay }: { product: AdminProduct; autosaveDelay?: number }) {
  const client = useQueryClient();
  const router = useRouter();
  const categories = useCategories();
  const status = productState(product);
  const isDraft = status === "draft";
  const isTea = product.type === "tea";
  const state = useProductForm(product, { autosave: isDraft, delay: autosaveDelay });
  const { form, update, errors } = state;
  const [publishError, setPublishError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // уходите со страницы с несохранёнными изменениями — браузер переспросит
  const unsaved = state.dirty && !isDraft;
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  function apply(next: AdminProduct) {
    client.setQueryData(productKeys.detail(product.id), next);
    void client.invalidateQueries({ queryKey: productKeys.lists });
  }

  const publish = useMutation({
    mutationFn: () => productsApi.publish(product.id),
    onSuccess: (next) => {
      apply(next);
      setPublishError(null);
      toast.success("Товар показан на сайте");
    },
    onError: (e) => setPublishError(errorMessage(e)),
  });
  const hide = useMutation({
    mutationFn: () => productsApi.hide(product.id),
    onSuccess: (next) => {
      apply(next);
      toast.success("Товар скрыт с сайта — покупатели его больше не видят");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: () => productsApi.restore(product.id),
    onSuccess: (next) => {
      apply(next);
      toast.success("Товар восстановлен. Он пока скрыт — покажите его, когда будете готовы.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function save(): Promise<boolean> {
    setSaveError(null);
    if (!state.valid) {
      setSaveError("Исправьте поля, отмеченные красным, — тогда сохраним.");
      return false;
    }
    try {
      await state.saveNow();
      return true;
    } catch {
      return false;
    }
  }

  async function onPublish() {
    setPublishError(null);
    if (state.dirty && !(await save())) return;
    publish.mutate();
  }

  const problems = [...new Set([...product.publish_problems, ...problemsInMessage(publishError ?? "")])];
  const fixes = problemSteps(problems, form.type);
  const category = findCategory(categories.data ?? [], form.category_id);
  const continueStep = fixes[0]?.step ?? 2;
  const fixLinks = fixes.length ? (
    <ul className="flex flex-wrap gap-2">
      {fixes.map((f) => (
        <li key={f.problem}>
          <a href={`#${SECTION_IDS[f.step]}`} className="inline-flex min-h-11 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted">
            Заполнить {f.problem}: раздел «{f.step <= 2 ? "Основное" : stepTitle(f.step, form.type)}»
          </a>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Все товары" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {product.name}
            <StatusBadge tone={PRODUCT_STATE_TONES[status]}>{product.status_label}</StatusBadge>
          </span>
        }
        description={`${PRODUCT_TYPE_LABELS[form.type]}${product.category ? ` · ${product.category.name}` : " · без категории"}`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {status === "archived" ? (
          <Button size="lg" onClick={() => restore.mutate()} disabled={restore.isPending}>
            Восстановить
          </Button>
        ) : status === "published" ? (
          <>
            <Button asChild variant="outline">
              <a href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Открыть на сайте
                <span className="sr-only"> (в новой вкладке)</span>
              </a>
            </Button>
            <Button variant="outline" onClick={() => hide.mutate()} disabled={hide.isPending}>
              Скрыть с сайта
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={() => void onPublish()} disabled={publish.isPending || state.saving}>
            Показать на сайте
          </Button>
        )}
        {isDraft ? (
          <Button asChild variant="outline">
            <Link href={`/admin/products/${product.id}/edit?step=${continueStep}`}>
              <ListChecks aria-hidden="true" />
              Продолжить по шагам
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye aria-hidden="true" />
          Предпросмотр
        </Button>
        <ConfirmAction
          trigger={
            <>
              <Copy aria-hidden="true" />
              Создать копию
            </>
          }
          title={`Создать копию «${product.name}»?`}
          description={
            <>
              <p>
                Скопируем название, описания, цену, граммовки, характеристики, заварку и связанные товары. Фото и остаток не копируются: у копии
                не будет фото, а на складе будет 0 {isTea ? "г" : "шт."} — добавьте фото и примите поставку.
              </p>
              <p className="mt-2">Копия появится черновиком: на сайте её не будет, пока вы её не покажете.</p>
              {state.dirty ? <p className="mt-2 font-medium text-foreground">Несохранённые изменения в копию не попадут.</p> : null}
            </>
          }
          confirm="Создать копию"
          cancel="Не создавать"
          destructive={false}
          onConfirm={async () => {
            const copy = await productsApi.copy(product.id);
            client.setQueryData(productKeys.detail(copy.id), copy);
            void client.invalidateQueries({ queryKey: productKeys.lists });
            toast.success("Копия создана — добавьте ей фото");
            router.push(`/admin/products/${copy.id}`);
          }}
        />
        {status !== "archived" ? (
          <ConfirmAction
            trigger="Убрать в архив"
            title={`Убрать «${product.name}» в архив?`}
            description="Товар пропадёт с сайта и из списка товаров. Остаток, история движения и прошлые заказы сохранятся. Вернуть можно в любой момент: «Товары» → вкладка «Архив» → «Восстановить»."
            confirm="Убрать в архив"
            cancel="Оставить"
            onConfirm={async () => {
              await productsApi.archive(product.id);
              toast.success("Товар убран в архив");
              void client.invalidateQueries({ queryKey: productKeys.lists });
              await client.invalidateQueries({ queryKey: productKeys.detail(product.id) });
            }}
          />
        ) : null}
      </div>

      {status === "archived" ? (
        <p className="mb-5 rounded-xl border bg-muted px-4 py-3 text-[15px]">
          Товар в архиве: его нет на сайте и в общем списке. Нажмите «Восстановить», чтобы вернуть его (он вернётся скрытым).
        </p>
      ) : publishError ? (
        <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="font-medium">{publishError}</p>
          {fixLinks}
        </div>
      ) : status !== "published" && fixes.length ? (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="font-medium">Чтобы показать товар на сайте, заполните: {problems.join(", ")}.</p>
          {fixLinks}
        </div>
      ) : null}

      {isDraft ? (
        <p role="status" aria-live="polite" className="mb-4 min-h-5 text-sm text-muted-foreground">
          {state.statusLabel || "Черновик сохраняется сам, пока вы заполняете поля."}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <SectionCard title="Основное" id="product-main" className="order-1 lg:order-none">
            <div className="flex flex-col gap-5">
              <CategorySelect value={form.category_id} onChange={(category_id) => update({ category_id })} error={errors.category_id} />
              <DescriptionFields form={form} update={update} errors={errors} />
            </div>
          </SectionCard>
          <SectionCard title="Фото" id="product-photos" className="order-2 lg:order-none">
            <ProductPhotos product={product} />
          </SectionCard>
          <SectionCard title={stepTitle(4, form.type)} id="product-price" className="order-3 lg:order-none">
            {isTea ? (
              <TeaPriceFields form={form} update={update} errors={errors} productId={product.id} />
            ) : (
              <UnitPriceFields form={form} update={update} errors={errors} productId={product.id} />
            )}
          </SectionCard>
          {isTea ? (
            <SectionCard title="Характеристики и заварка" id="product-attributes" className="order-5 lg:order-none">
              <div className="flex flex-col gap-8">
                <CharacteristicsFields form={form} update={update} errors={errors} />
                <div className="flex flex-col gap-3">
                  <h3 className="text-base font-semibold">Как заварить</h3>
                  <BrewingFields form={form} update={update} errors={errors} />
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <StockSection product={product} state={state} />
          <SectionCard title="Связанные товары" id="product-relations" className="order-6 lg:order-none">
            <ProductRelations product={product} />
          </SectionCard>
          <SectionCard title="Поиск и адрес страницы" id="product-seo" className="order-7 lg:order-none">
            <div className="flex flex-col gap-5">
              <SearchAliasesField form={form} update={update} />
              <SlugField form={form} update={update} errors={errors} />
              <SeoFields form={form} update={update} errors={errors} />
            </div>
          </SectionCard>
        </div>
      </div>

      {!isDraft && (state.dirty || saveError || state.error) ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-20 mt-5 flex flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          {saveError || state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {saveError ?? state.error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-muted-foreground">{state.dirty ? "Есть несохранённые изменения" : ""}</span>
            {state.dirty ? (
              <>
                <Button variant="outline" onClick={state.reset} disabled={state.saving}>
                  Отменить
                </Button>
                <Button
                  onClick={() =>
                    void save().then((ok) => {
                      if (ok) toast.success(status === "published" ? "Сохранено — на сайте уже новая версия" : "Сохранено");
                    })
                  }
                  disabled={state.saving}
                >
                  {state.saving ? "Сохраняем…" : "Сохранить изменения"}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[calc(100dvh-24px)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Предпросмотр</DialogTitle>
            <DialogDescription>Как товар выглядит на сайте</DialogDescription>
          </DialogHeader>
          <ProductPreview form={form} product={product} categoryName={category?.name ?? product.category?.name} tileColor={category?.tile_color} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Карточка товара: все поля секциями, фото, показ на сайте, копия, архив (SPEC 10.3). */
export function ProductEditor({ id, autosaveDelay }: { id: string; autosaveDelay?: number }) {
  const query = useQuery({ queryKey: productKeys.detail(id), queryFn: () => productsApi.get(id) });
  return (
    <QueryState query={query} skeleton={5}>
      {(product) => <EditorView key={product.id} product={product} autosaveDelay={autosaveDelay} />}
    </QueryState>
  );
}
