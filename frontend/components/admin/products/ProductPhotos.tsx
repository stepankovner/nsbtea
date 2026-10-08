"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, GripVertical, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Field } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/errors";
import { MAX_UPLOAD_MB } from "@/lib/admin/media";
import { MAX_PHOTOS, productKeys, productsApi, type AdminProduct } from "@/lib/admin/products";
import { cn } from "@/lib/utils";

import { cropToSquare, type CropArea } from "./crop";
import { SquareCropDialog } from "./SquareCropDialog";

type Image = AdminProduct["images"][number];

interface Queue {
  files: File[];
  index: number;
  url: string;
  done: File[];
}

const announcements = {
  onDragStart: () => "Взяли фото. Стрелками — переместить, пробел — отпустить.",
  onDragOver: () => "",
  onDragEnd: () => "Фото перемещено.",
  onDragCancel: () => "Перемещение отменено.",
};

function PhotoCaption({ product, image, n }: { product: AdminProduct; image: Image; n: number }) {
  const client = useQueryClient();
  const id = useId();
  const [text, setText] = useState(image.alt ?? "");
  const [synced, setSynced] = useState(image.alt);
  if (image.alt !== synced) {
    setSynced(image.alt);
    setText(image.alt ?? "");
  }
  async function save() {
    const next = text.trim() || null;
    if (next === (image.alt ?? null)) return;
    try {
      const updated = await productsApi.updateImageAlt(product.id, image.id, next);
      client.setQueryData(productKeys.detail(product.id), updated);
      toast.success("Подпись сохранена");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <Field
      id={id}
      label={`Подпись к фото ${n}`}
      hint="Коротко, что на фото, например «Сухой лист Да Хун Пао». Её читают поисковики и программы для незрячих."
    >
      <Input id={id} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} onBlur={() => void save()} />
    </Field>
  );
}

function PhotoCard({
  product,
  image,
  index,
  count,
  onMove,
  onDelete,
}: {
  product: AdminProduct;
  image: Image;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDelete: (image: Image) => Promise<void>;
}) {
  const n = index + 1;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3 sm:flex-col",
        isDragging && "relative z-10 shadow-lg ring-2 ring-[#8E3236]/40",
      )}
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:aspect-square sm:size-auto sm:w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- превью из медиатеки */}
        <img src={image.srcset["320"] ?? image.url} alt={image.alt || product.name} className="h-full w-full object-cover" />
        {index === 0 ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground/85 px-2 py-0.5 text-xs text-background">Главное фото</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <PhotoCaption product={product} image={image} n={n} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Перетащить фото ${n}`}
            className="cursor-grab touch-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label={`Переместить фото ${n} выше`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Переместить фото ${n} ниже`}
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <div className="ml-auto">
            <ConfirmAction
              trigger={
                <>
                  <Trash2 aria-hidden="true" />
                  <span className="sr-only">Удалить фото {n}</span>
                </>
              }
              title={`Удалить фото ${n}?`}
              description="Фото сразу пропадёт с сайта. Вернуть его можно, только загрузив заново."
              confirm="Удалить фото"
              cancel="Оставить"
              onConfirm={() => onDelete(image)}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/** Фото товара: несколько сразу (камера или галерея), обрезка до квадрата, порядок, подписи, удаление. */
export function ProductPhotos({ product }: { product: AdminProduct }) {
  const client = useQueryClient();
  const galleryId = useId();
  const cameraId = useId();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<{ base: string; ids: string[] } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const serverIds = product.images.map((i) => i.id);
  const base = serverIds.join(",");
  const ids = optimistic && optimistic.base === base ? optimistic.ids : serverIds;
  const byId = new Map(product.images.map((i) => [i.id, i]));
  const images = ids.map((id) => byId.get(id)).filter((i): i is Image => Boolean(i));
  const free = MAX_PHOTOS - images.length;

  function update(next: AdminProduct) {
    client.setQueryData(productKeys.detail(product.id), next);
    void client.invalidateQueries({ queryKey: productKeys.lists });
  }

  async function reorder(next: string[]) {
    setOptimistic({ base, ids: next });
    try {
      update(await productsApi.reorderImages(product.id, next));
    } catch (e) {
      setOptimistic(null);
      toast.error(errorMessage(e));
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= ids.length) return;
    void reorder(arrayMove(ids, from, to));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  }

  async function remove(image: Image) {
    update(await productsApi.deleteImage(product.id, image.id));
    toast.success("Фото удалено");
  }

  function startQueue(files: File[], done: File[] = [], index = 0) {
    if (index >= files.length) {
      setQueue(null);
      void upload(done);
      return;
    }
    setQueue({ files, index, done, url: URL.createObjectURL(files[index]!) });
  }

  function choose(list: FileList | null, input: HTMLInputElement) {
    const files = Array.from(list ?? []);
    input.value = "";
    if (!files.length) return;
    setError(null);
    const notImage = files.find((f) => !f.type.startsWith("image/"));
    if (notImage) {
      setError(`«${notImage.name}» — не картинка. Выберите фото в формате JPG, PNG или WebP`);
      return;
    }
    const big = files.find((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (big) {
      setError(`Файл «${big.name}» больше ${MAX_UPLOAD_MB} МБ — уменьшите фото и попробуйте снова`);
      return;
    }
    if (files.length > free) {
      setError(
        free > 0
          ? `Можно добавить ещё ${free} фото — всего не больше ${MAX_PHOTOS}. Выберите меньше или удалите лишние.`
          : `Уже ${MAX_PHOTOS} фото — больше нельзя. Удалите лишнее, чтобы добавить новое.`,
      );
      return;
    }
    startQueue(files);
  }

  async function next(q: Queue, cropped: File | null) {
    URL.revokeObjectURL(q.url);
    startQueue(q.files, cropped ? [...q.done, cropped] : q.done, q.index + 1);
  }

  async function cropCurrent(q: Queue, area: CropArea | null) {
    setBusy(true);
    try {
      await next(q, await cropToSquare(q.files[q.index]!, area));
    } catch (e) {
      setError(e instanceof Error ? e.message : errorMessage(e));
      setQueue(null);
    } finally {
      setBusy(false);
    }
  }

  async function cropRest(q: Queue, area: CropArea | null) {
    setBusy(true);
    try {
      const done = [...q.done, await cropToSquare(q.files[q.index]!, area)];
      for (const file of q.files.slice(q.index + 1)) done.push(await cropToSquare(file, null));
      URL.revokeObjectURL(q.url);
      setQueue(null);
      await upload(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : errorMessage(e));
      setQueue(null);
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      update(await productsApi.uploadImages(product.id, files));
      toast.success(`Добавлено фото: ${files.length}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pickerDisabled = busy || free <= 0;
  const pickerClass = cn(
    "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-[15px] font-medium",
    "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
    pickerDisabled ? "pointer-events-none opacity-50" : "hover:bg-muted",
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted-foreground">
        Фото: {images.length} из {MAX_PHOTOS}. Первое — главное, его видно в каталоге. Лучше всего — светлый однотонный фон. Порядок меняется
        перетаскиванием за ручку <GripVertical className="inline size-4 align-text-bottom" aria-hidden="true" /> или кнопками со стрелками.
      </p>

      {images.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: "Чтобы взять фото, нажмите пробел или Enter. Стрелками — переместить, пробел — отпустить, Escape — отменить.",
            },
          }}
        >
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((image, index) => (
                <PhotoCard
                  key={image.id}
                  product={product}
                  image={image}
                  index={index}
                  count={images.length}
                  onMove={move}
                  onDelete={remove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[15px] text-muted-foreground">
          Пока нет фото. Товар без фото на сайте выглядит пустой плиткой — добавьте хотя бы одно.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={galleryId} className={cn(pickerClass, "bg-foreground text-background hover:bg-foreground/85")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-4" aria-hidden="true" />}
          Выбрать фото
        </label>
        <input
          id={galleryId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={pickerDisabled}
          onChange={(e) => choose(e.target.files, e.target)}
        />
        <label htmlFor={cameraId} className={cn(pickerClass, "bg-background md:hidden")}>
          <Camera className="size-4" aria-hidden="true" />
          Снять на камеру
        </label>
        <input
          id={cameraId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={pickerDisabled}
          onChange={(e) => choose(e.target.files, e.target)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {free > 0
            ? `Можно выбрать несколько сразу. JPG, PNG или WebP до ${MAX_UPLOAD_MB} МБ — обрежем до квадрата и сожмём сами.`
            : `Добавлено ${MAX_PHOTOS} из ${MAX_PHOTOS} фото — больше нельзя. Удалите лишнее, чтобы добавить новое.`}
        </p>
      )}

      {queue ? (
        <SquareCropDialog
          key={queue.index}
          url={queue.url}
          index={queue.index + 1}
          total={queue.files.length}
          busy={busy}
          onDone={(area) => void cropCurrent(queue, area)}
          onSkip={() => void next(queue, null)}
          onRestAuto={(area) => void cropRest(queue, area)}
        />
      ) : null}
    </div>
  );
}
