"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { EmptyState, PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api/errors";
import {
  BLOCK_SCHEMAS,
  blockSummary,
  contentKeys,
  homeApi,
  isBlockKind,
  type HomeBlock,
  type HomeBlockKind,
} from "@/lib/admin/content";
import { cn } from "@/lib/utils";

import { RequirePermission } from "./shared";

function BlockRow({
  block,
  first,
  last,
  onMove,
  onToggle,
}: {
  block: HomeBlock;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onToggle: (visible: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.kind });
  const schema = isBlockKind(block.kind) ? BLOCK_SCHEMAS[block.kind] : null;
  const summary = blockSummary(block);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-col gap-2 border-b bg-card px-2 py-3 last:border-b-0 md:flex-row md:items-center md:gap-3 md:px-3",
        isDragging && "relative z-10 rounded-lg shadow-lg",
        !block.is_visible && "bg-muted/40",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Перетащить: ${block.label}`}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-medium">{block.label}</h2>
            {block.is_visible ? (
              <StatusBadge tone="success">На главной</StatusBadge>
            ) : (
              <StatusBadge>Скрыт</StatusBadge>
            )}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {summary && summary !== block.label ? summary : schema?.description}
          </p>
        </div>
        <div className="flex min-h-11 shrink-0 items-center px-2">
          <Switch
            checked={block.is_visible}
            onCheckedChange={onToggle}
            aria-label={`Показывать на главной: ${block.label}`}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[50px] md:pl-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Выше: ${block.label}`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Ниже: ${block.label}`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button asChild variant="outline" className="flex-1 md:flex-none">
          <Link href={`/admin/content/home/${block.kind}`}>Изменить</Link>
        </Button>
      </div>
    </li>
  );
}

function BlocksList({ blocks }: { blocks: HomeBlock[] }) {
  const client = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labels = Object.fromEntries(blocks.map((b) => [b.kind, b.label]));
  const name = (id: unknown) => `«${labels[String(id)] ?? String(id)}»`;
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Блок ${name(active.id)} взят. Стрелками вверх и вниз — переместить, пробел — оставить здесь.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Блок ${name(active.id)} над блоком ${name(over.id)}`
        : `Блок ${name(active.id)} вне списка`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Блок ${name(active.id)} поставлен на место блока ${name(over.id)}`
        : `Блок ${name(active.id)} оставлен на месте`,
    onDragCancel: ({ active }) => `Перемещение блока ${name(active.id)} отменено`,
  };

  const reorder = useMutation({
    mutationFn: (kinds: HomeBlockKind[]) => homeApi.reorder(kinds),
    onMutate: async (kinds) => {
      await client.cancelQueries({ queryKey: contentKeys.blocks });
      const previous = client.getQueryData<HomeBlock[]>(contentKeys.blocks);
      if (previous) {
        const byKind = new Map(previous.map((b) => [b.kind, b]));
        client.setQueryData(
          contentKeys.blocks,
          kinds.flatMap((k, i) => {
            const b = byKind.get(k);
            return b ? [{ ...b, sort_order: i }] : [];
          }),
        );
      }
      return { previous };
    },
    onError: (e, _kinds, ctx) => {
      if (ctx?.previous) client.setQueryData(contentKeys.blocks, ctx.previous);
      toast.error(`Порядок не сохранился: ${errorMessage(e)}`);
    },
    onSuccess: () => toast.success("Порядок сохранён — на сайте он уже новый"),
  });

  const toggle = useMutation({
    mutationFn: ({ kind, visible }: { kind: HomeBlockKind; visible: boolean }) =>
      homeApi.patch(kind, { is_visible: visible }),
    onMutate: async ({ kind, visible }) => {
      await client.cancelQueries({ queryKey: contentKeys.blocks });
      const previous = client.getQueryData<HomeBlock[]>(contentKeys.blocks);
      client.setQueryData<HomeBlock[]>(contentKeys.blocks, (list) =>
        list?.map((b) => (b.kind === kind ? { ...b, is_visible: visible } : b)),
      );
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) client.setQueryData(contentKeys.blocks, ctx.previous);
      toast.error(errorMessage(e));
    },
    onSuccess: (next) => {
      client.setQueryData<HomeBlock[]>(contentKeys.blocks, (list) =>
        list?.map((b) => (b.kind === next.kind ? { ...b, ...next } : b)),
      );
      toast.success(
        next.is_visible
          ? `«${next.label}» снова на главной`
          : `«${next.label}» скрыт с главной. Настройки блока сохранены`,
      );
    },
  });

  const kinds = blocks.map((b) => b.kind as HomeBlockKind);

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= kinds.length) return;
    reorder.mutate(arrayMove(kinds, index, target));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = kinds.indexOf(active.id as HomeBlockKind);
    const to = kinds.indexOf(over.id as HomeBlockKind);
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(kinds, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Чтобы переместить блок, нажмите пробел, затем стрелки вверх или вниз, и ещё раз пробел. Escape — отменить.",
        },
      }}
    >
      <SortableContext items={kinds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
          {blocks.map((block, index) => (
            <BlockRow
              key={block.kind}
              block={block}
              first={index === 0}
              last={index === blocks.length - 1}
              onMove={(delta) => move(index, delta)}
              onToggle={(visible) => toggle.mutate({ kind: block.kind as HomeBlockKind, visible })}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function BlocksContent() {
  const list = useQuery({
    queryKey: contentKeys.blocks,
    queryFn: async () => [...(await homeApi.list())].sort((a, b) => a.sort_order - b.sort_order),
  });
  return (
    <QueryState query={list}>
      {(blocks) =>
        blocks.length ? (
          <>
            <p className="mb-3 text-[15px] text-muted-foreground">
              Блоки идут на главной сверху вниз в этом порядке. Перетащите блок за ручку слева или
              нажимайте стрелки. Выключенный блок не виден на сайте, но его тексты и фото
              сохраняются.
            </p>
            <BlocksList blocks={blocks} />
          </>
        ) : (
          <EmptyState icon={LayoutTemplate} title="Блоков пока нет">
            Блоки главной создаются сами при запуске сайта. Если список пуст, обновите страницу чуть
            позже.
          </EmptyState>
        )
      }
    </QueryState>
  );
}

export function HomeBlocks() {
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content", label: "Сайт" }}
        title="Главная страница"
        description="Что показывать на главной и в каком порядке. Изменения сразу видны на сайте."
        actions={
          <Button asChild variant="outline">
            <a href="/" target="_blank" rel="noopener">
              <ExternalLink aria-hidden="true" />
              Открыть главную
            </a>
          </Button>
        }
      />
      <RequirePermission permission="content">
        <BlocksContent />
      </RequirePermission>
    </>
  );
}
