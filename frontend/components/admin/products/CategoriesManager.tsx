"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowUp, FolderTree, Pencil, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Field } from "@/components/admin/Field";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { tileColors } from "@/components/shop/tile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Schemas } from "@/lib/api/client";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import { categoriesApi, categoryKeys, TILE_COLORS, type AdminCategory, type CategoryCreate, type TileColor } from "@/lib/admin/categories";
import { productKeys } from "@/lib/admin/products";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

import { NativeSelect } from "./inputs";

type Media = Schemas["MediaOut"];
type Editing = { kind: "create"; parentId: string | null } | { kind: "edit"; category: AdminCategory };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function countLabel(n: number): string {
  return n ? `${n} ${plural(n, "товар", "товара", "товаров")}` : "нет товаров";
}

function CategoryDialog({ editing, roots, onClose }: { editing: Editing; roots: AdminCategory[]; onClose: () => void }) {
  const client = useQueryClient();
  const nameId = useId();
  const slugId = useId();
  const parentId = useId();
  const descId = useId();
  const seoTitleId = useId();
  const seoDescId = useId();
  const current = editing.kind === "edit" ? editing.category : null;
  const [name, setName] = useState(current?.name ?? "");
  const [slug, setSlug] = useState(current?.slug ?? "");
  const [parent, setParent] = useState<string | null>(editing.kind === "create" ? editing.parentId : (current?.parent_id ?? null));
  const [description, setDescription] = useState(current?.description ?? "");
  const [cover, setCover] = useState<Media | null>(current?.cover ?? null);
  const [tile, setTile] = useState<TileColor>((current?.tile_color as TileColor | undefined) ?? "neutral");
  const [visible, setVisible] = useState(current?.is_visible ?? true);
  const [seoTitle, setSeoTitle] = useState(current?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(current?.seo_description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const hasChildren = Boolean(current?.children.length);
  const parentOptions = roots.filter((r) => r.id !== current?.id);
  const text = (v: string) => v.trim() || null;

  function createBody(): CategoryCreate {
    return {
      name: name.trim(),
      parent_id: parent,
      ...(slug.trim() ? { slug: slug.trim().toLowerCase() } : {}),
      description: text(description),
      is_visible: visible,
      tile_color: tile,
      cover_media_id: cover?.id ?? null,
      seo_title: text(seoTitle),
      seo_description: text(seoDescription),
    };
  }

  /** Только изменённые поля. */
  function patchBody(c: AdminCategory): Schemas["CategoryPatch"] {
    const out: Schemas["CategoryPatch"] = {};
    if (name.trim() !== c.name) out.name = name.trim();
    if (slug.trim() && slug.trim().toLowerCase() !== c.slug) out.slug = slug.trim().toLowerCase();
    if (parent !== c.parent_id) out.parent_id = parent;
    if (text(description) !== (c.description ?? null)) out.description = text(description);
    if (visible !== c.is_visible) out.is_visible = visible;
    if (tile !== c.tile_color) out.tile_color = tile;
    if ((cover?.id ?? null) !== (c.cover?.id ?? null)) out.cover_media_id = cover?.id ?? null;
    if (text(seoTitle) !== (c.seo_title ?? null)) out.seo_title = text(seoTitle);
    if (text(seoDescription) !== (c.seo_description ?? null)) out.seo_description = text(seoDescription);
    return out;
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!current) return categoriesApi.create(createBody());
      const payload = patchBody(current);
      return Object.keys(payload).length ? categoriesApi.patch(current.id, payload) : null;
    },
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: categoryKeys.all });
      void client.invalidateQueries({ queryKey: productKeys.all });
      if (result) toast.success(current ? "Категория сохранена" : "Категория создана");
      onClose();
    },
    onError: (e) => {
      setErrors(e instanceof ApiError ? fieldErrors(e) : {});
      setError(errorMessage(e));
    },
  });

  function submit() {
    setError(null);
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Напишите название, например «Шу пуэр»";
    if (slug.trim() && !SLUG_RE.test(slug.trim().toLowerCase())) local.slug = "Только латиница, цифры и дефисы, например shu-puer";
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate();
  }

  const title = current ? `Категория «${current.name}»` : parent ? "Новая подкатегория" : "Новая категория";
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-24px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Название и порядок — как в меню каталога на сайте. Остальное можно заполнить позже.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field id={nameId} label="Название" required error={errors.name} hint="Как раздел называется в каталоге, например «Шу пуэр» или «Посуда».">
            <Input id={nameId} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <Field
            id={parentId}
            label="Где находится"
            error={errors.parent_id}
            hint="Основная категория — в меню сразу. Подкатегория — внутри основной, например «Шу пуэр» внутри «Пуэр»."
            description={hasChildren ? "У этой категории есть подкатегории, поэтому она может быть только основной." : undefined}
          >
            <NativeSelect id={parentId} value={parent ?? ""} onChange={(e) => setParent(e.target.value || null)} disabled={hasChildren}>
              <option value="">Основная категория</option>
              {parentOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  Внутри «{r.name}»
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id={slugId}
            label="Адрес страницы"
            error={errors.slug}
            hint="Латиница, цифры и дефисы, например shu-puer. Если оставить пустым — составим из названия. Старый адрес будет сам перенаправлять на новый."
            description={slug.trim() ? `Полный адрес: nsbtea.ru/catalog/${slug.trim().toLowerCase()}` : "Пусто — составим из названия"}
          >
            <Input id={slugId} value={slug} maxLength={80} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Field id={descId} label="Описание" error={errors.description} hint="Пара абзацев на странице категории — помогает и покупателям, и поисковикам. Например: что такое шу пуэр и как его выбрать.">
            <Textarea id={descId} rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <ImageUpload label="Обложка" value={cover} onChange={setCover} hint="Картинка для плитки категории на главной и в каталоге. Лучше горизонтальная, например 1200 × 900." />
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Цвет плитки</span>
            <RadioGroup value={tile} onValueChange={(v) => setTile(v as TileColor)} aria-label="Цвет плитки" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TILE_COLORS.map((c) => (
                <Label key={c.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 font-normal">
                  <RadioGroupItem value={c.value} aria-label={c.label} />
                  <span className="size-5 shrink-0 rounded border" style={{ background: tileColors(c.value).bg }} aria-hidden="true" />
                  {c.label}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <Label className="flex min-h-11 items-center gap-3 font-normal">
            <Checkbox checked={visible} onCheckedChange={(v) => setVisible(v === true)} aria-label="Показывать на сайте" />
            Показывать на сайте
          </Label>
          <details className="rounded-lg border px-3 py-2">
            <summary className="min-h-9 cursor-pointer py-1.5 text-[15px] font-medium">Для поисковиков (необязательно)</summary>
            <div className="flex flex-col gap-4 pt-3">
              <Field id={seoTitleId} label="Заголовок для поисковиков" error={errors.seo_title} hint="Если пусто — возьмём название. Например: «Шу пуэр — купить в Москве»">
                <Input id={seoTitleId} value={seoTitle} maxLength={200} onChange={(e) => setSeoTitle(e.target.value)} />
              </Field>
              <Field id={seoDescId} label="Описание для поисковиков" error={errors.seo_description} hint="1–2 предложения под ссылкой в Яндексе и Google.">
                <Textarea id={seoDescId} rows={2} maxLength={400} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
              </Field>
            </div>
          </details>
          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Отмена
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  category,
  siblings,
  index,
  onEdit,
  onAddChild,
  onMove,
}: {
  category: AdminCategory;
  siblings: AdminCategory[];
  index: number;
  onEdit: (c: AdminCategory) => void;
  onAddChild?: (c: AdminCategory) => void;
  onMove: (siblings: AdminCategory[], from: number, to: number) => void;
}) {
  const client = useQueryClient();
  const name = category.name;
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          {!category.is_visible ? <StatusBadge tone="warning">Скрыта с сайта</StatusBadge> : null}
        </span>
        <span className="text-sm text-muted-foreground">{countLabel(category.products_count)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="icon" aria-label={`Переместить «${name}» выше`} disabled={index === 0} onClick={() => onMove(siblings, index, index - 1)}>
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Переместить «${name}» ниже`}
          disabled={index === siblings.length - 1}
          onClick={() => onMove(siblings, index, index + 1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button variant="outline" aria-label={`Изменить «${name}»`} onClick={() => onEdit(category)}>
          <Pencil aria-hidden="true" />
          Изменить
        </Button>
        {onAddChild ? (
          <Button variant="outline" aria-label={`Добавить подкатегорию в «${name}»`} onClick={() => onAddChild(category)}>
            <Plus aria-hidden="true" />
            Подкатегория
          </Button>
        ) : null}
        <ConfirmAction
          trigger={
            <>
              <Archive aria-hidden="true" />
              <span className="sr-only">Убрать в архив «{name}»</span>
              <span aria-hidden="true" className="hidden sm:inline">
                В архив
              </span>
            </>
          }
          title={`Убрать «${name}» в архив?`}
          description="Категория пропадёт с сайта и из выбора категорий у товаров. Убрать можно только пустую категорию: сначала перенесите её товары в другую категорию или уберите их в архив, а подкатегории — тоже в архив. Вернуть можно во вкладке «Архив» кнопкой «Восстановить»."
          confirm="Убрать в архив"
          cancel="Оставить"
          onConfirm={async () => {
            await categoriesApi.archive(category.id);
            toast.success(`Категория «${name}» убрана в архив`);
            void client.invalidateQueries({ queryKey: categoryKeys.all });
          }}
        />
      </div>
    </div>
  );
}

/** Категории каталога: двухуровневое дерево, порядок, создание, изменение, архив (SPEC 3.1). */
export function CategoriesManager() {
  const client = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const list = useQuery({ queryKey: categoryKeys.list(archived), queryFn: () => categoriesApi.list(archived) });
  // для выбора «где находится» нужны действующие основные категории — даже если открыт архив
  const active = useQuery({ queryKey: categoryKeys.list(false), queryFn: () => categoriesApi.list(false), enabled: archived && editing !== null });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => categoriesApi.reorder(ids),
    onSuccess: () => {
      toast.success("Порядок сохранён");
      void client.invalidateQueries({ queryKey: categoryKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const restore = useMutation({
    mutationFn: (c: AdminCategory) => categoriesApi.restore(c.id),
    onSuccess: (_, c) => {
      toast.success(`Категория «${c.name}» восстановлена`);
      void client.invalidateQueries({ queryKey: categoryKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function move(siblings: AdminCategory[], from: number, to: number) {
    if (to < 0 || to >= siblings.length) return;
    const ids = siblings.map((c) => c.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    reorder.mutate(ids);
  }

  const roots = (archived ? active.data : list.data) ?? [];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: "Товары" }}
        title="Категории"
        description="Разделы каталога на сайте: основные категории и подкатегории внутри них. Порядок здесь — как в меню каталога."
        actions={
          <Button size="lg" onClick={() => setEditing({ kind: "create", parentId: null })}>
            <Plus aria-hidden="true" />
            Добавить категорию
          </Button>
        }
      />

      <div className="mb-4 flex gap-1.5" role="group" aria-label="Какие категории показать">
        {[
          { value: false, label: "Действующие" },
          { value: true, label: "Архив" },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-pressed={archived === tab.value}
            onClick={() => setArchived(tab.value)}
            className={cn(
              "flex min-h-10 items-center rounded-full border px-3.5 text-sm",
              archived === tab.value ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <QueryState query={list}>
        {(tree) =>
          !tree.length ? (
            archived ? (
              <EmptyState icon={FolderTree} title="В архиве пусто">
                Сюда попадают категории, которые вы убрали в архив. Их можно восстановить.
              </EmptyState>
            ) : (
              <EmptyState
                icon={FolderTree}
                title="Пока нет категорий"
                action={<Button onClick={() => setEditing({ kind: "create", parentId: null })}>Создать первую категорию</Button>}
              >
                Создайте разделы каталога, например «Шу пуэр», «Улун», «Посуда». Внутри основной категории можно сделать подкатегории.
              </EmptyState>
            )
          ) : archived ? (
            <ul className="flex flex-col rounded-xl border bg-card px-4">
              {tree.flatMap((c) => [c, ...c.children]).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
                  <span className="flex flex-col">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-sm text-muted-foreground">{countLabel(c.products_count)}</span>
                  </span>
                  <Button variant="outline" aria-label={`Восстановить «${c.name}»`} disabled={restore.isPending} onClick={() => restore.mutate(c)}>
                    Восстановить
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col rounded-xl border bg-card px-4">
              {tree.map((root, index) => (
                <li key={root.id} className="border-b last:border-b-0">
                  <CategoryRow
                    category={root}
                    siblings={tree}
                    index={index}
                    onEdit={(c) => setEditing({ kind: "edit", category: c })}
                    onAddChild={(c) => setEditing({ kind: "create", parentId: c.id })}
                    onMove={move}
                  />
                  {root.children.length ? (
                    <ul className="mb-3 ml-3 flex flex-col border-l pl-3 sm:ml-5 sm:pl-4" aria-label={`Подкатегории «${root.name}»`}>
                      {root.children.map((child, i) => (
                        <li key={child.id} className="border-b last:border-b-0">
                          <CategoryRow
                            category={child}
                            siblings={root.children}
                            index={i}
                            onEdit={(c) => setEditing({ kind: "edit", category: c })}
                            onMove={move}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      {editing ? <CategoryDialog editing={editing} roots={roots} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
