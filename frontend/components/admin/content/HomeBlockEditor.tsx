"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Info, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { describedBy, Field } from "@/components/admin/Field";
import { ImageUpload } from "@/components/admin/ImageUpload";
import {
  EmptyState,
  PageHeader,
  QueryState,
  SectionCard,
  StatusBadge,
} from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import {
  AboutBlock,
  AdvantagesBlock,
  HeroBlock,
  ServicesBlock,
  WholesaleBlock,
} from "@/components/shop/home/blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import {
  BLOCK_SCHEMAS,
  contentKeys,
  homeApi,
  isBlockKind,
  linkError,
  type BlockField,
  type HomeBlock,
  type HomeBlockKind,
  type Media,
} from "@/lib/admin/content";

import { PreviewButton, RequirePermission, SaveBar } from "./shared";

type Data = Record<string, unknown>;
type Images = Record<string, Media>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
/** сколько товаров показывает сервер, если «limit» не задан (content_public.home) */
const DEFAULT_LIMIT = 4;

function emptyItem(fields: BlockField[]): Data {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.type === "image" ? null : f.type === "color" ? (f.options?.[0]?.value ?? "") : "",
    ]),
  );
}

/** Ошибки полей блока: ссылки и числа. Ключи — «items.0.cta_href». */
function validate(fields: BlockField[], data: Data, prefix = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const value = data[f.key];
    if (f.type === "link") {
      const problem = linkError(value);
      if (problem) errors[prefix + f.key] = problem;
    } else if (f.type === "number" && value !== null && value !== undefined && value !== "") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 1000))
        errors[prefix + f.key] = `Число от ${f.min ?? 0} до ${f.max ?? 1000}`;
    } else if (f.type === "products" && Array.isArray(value)) {
      // сервер показывает не больше «limit» товаров — лишние выбранные просто не появятся
      const limit = Number(data.limit) || DEFAULT_LIMIT;
      if (value.length > limit) {
        errors[prefix + f.key] =
          `Выбрано ${value.length}, а показываем ${limit}. Уберите лишние или увеличьте «Сколько товаров показать».`;
      }
    } else if (f.type === "items" && Array.isArray(value) && f.fields) {
      value.forEach((item, i) =>
        Object.assign(errors, validate(f.fields!, (item ?? {}) as Data, `${prefix}${f.key}.${i}.`)),
      );
    }
  }
  return errors;
}

function FieldInput({
  field,
  value,
  onChange,
  images,
  onImage,
  error,
}: {
  field: BlockField;
  value: unknown;
  onChange: (v: unknown) => void;
  images: Images;
  onImage: (m: Media) => void;
  error?: string;
}) {
  const id = useId();
  switch (field.type) {
    case "image": {
      const media = typeof value === "string" ? (images[value] ?? null) : null;
      return (
        <ImageUpload
          label={field.label}
          hint={field.hint}
          value={media}
          aspect={field.aspect ?? "aspect-[4/3]"}
          onChange={(m) => {
            if (m) onImage(m);
            onChange(m?.id ?? null);
          }}
        />
      );
    }
    case "products":
      return (
        <div className="flex flex-col gap-1.5">
          <ProductPicker
            label={field.label}
            hint={field.hint}
            max={field.max}
            value={Array.isArray(value) ? value.map(String) : []}
            onChange={(ids) => onChange(ids)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      );
    case "color": {
      const labelId = `${id}-label`;
      return (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
          <span id={labelId} className="text-[15px] font-medium">
            {field.label}
          </span>
          <RadioGroup
            value={str(value) || field.options?.[0]?.value}
            onValueChange={onChange}
            className="flex flex-wrap gap-2"
          >
            {field.options?.map((o) => (
              <Label
                key={o.value}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 font-normal"
              >
                <RadioGroupItem value={o.value} aria-label={o.label} />
                <span
                  className="size-4 rounded-full"
                  style={{ background: o.swatch }}
                  aria-hidden="true"
                />
                {o.label}
              </Label>
            ))}
          </RadioGroup>
        </div>
      );
    }
    case "textarea":
      return (
        <Field id={id} label={field.label} hint={field.hint} error={error}>
          <Textarea
            id={id}
            value={str(value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "number":
      return (
        <Field id={id} label={field.label} hint={field.hint} error={error}>
          <Input
            id={id}
            inputMode="numeric"
            className="max-w-32"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              onChange(digits ? Number(digits) : null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, error)}
          />
        </Field>
      );
    default:
      return (
        <Field id={id} label={field.label} hint={field.hint} error={error}>
          <Input
            id={id}
            value={str(value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            inputMode={field.type === "link" ? "url" : undefined}
            autoCapitalize={field.type === "link" ? "none" : undefined}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, error)}
          />
        </Field>
      );
  }
}

function ItemsField({
  field,
  value,
  onChange,
  images,
  onImage,
  errors,
}: {
  field: BlockField;
  value: unknown;
  onChange: (v: Data[]) => void;
  images: Images;
  onImage: (m: Media) => void;
  errors: Record<string, string>;
}) {
  const items = Array.isArray(value) ? (value as Data[]) : [];
  const fields = field.fields ?? [];
  const name = field.itemLabel ?? "Карточка";
  const max = field.max ?? 6;
  const accusative = field.itemAccusative ?? name.toLowerCase();

  function patch(index: number, key: string, v: unknown) {
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: v } : item)));
  }
  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved!);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">{field.label}</span>
        <span className="text-sm text-muted-foreground">
          {items.length} из {max}
        </span>
      </div>
      {items.map((item, index) => (
        <fieldset
          key={index}
          className="flex flex-col gap-4 rounded-lg border bg-background p-3 md:p-4"
        >
          <legend className="sr-only">
            {name} {index + 1}
          </legend>
          <div className="flex items-center justify-between gap-2">
            <span aria-hidden="true" className="font-medium">
              {name} {index + 1}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Поднять ${accusative} ${index + 1}`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Опустить ${accusative} ${index + 1}`}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Убрать ${accusative} ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
          {fields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={item[f.key]}
              onChange={(v) => patch(index, f.key, v)}
              images={images}
              onImage={onImage}
              error={errors[`${field.key}.${index}.${f.key}`]}
            />
          ))}
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={items.length >= max}
        onClick={() => onChange([...items, emptyItem(fields)])}
      >
        <Plus aria-hidden="true" />
        Добавить {accusative}
      </Button>
    </div>
  );
}

function BlockPreview({ kind, data, images }: { kind: HomeBlockKind; data: Data; images: Images }) {
  const block: Schemas["HomeBlockOut"] = {
    kind,
    data,
    images,
    products: [],
    events: [],
    thursday: null,
  };
  switch (kind) {
    case "hero":
      return <HeroBlock block={block} />;
    case "services":
      return <ServicesBlock block={block} />;
    case "about":
      return <AboutBlock block={block} />;
    case "advantages":
      return <AdvantagesBlock block={block} />;
    case "wholesale":
      return <WholesaleBlock block={block} />;
    default:
      return null;
  }
}

function BlockForm({ block, kind }: { block: HomeBlock; kind: HomeBlockKind }) {
  const client = useQueryClient();
  const schema = BLOCK_SCHEMAS[kind];
  const [data, setData] = useState<Data>(() => ({ ...block.data }));
  const [saved, setSaved] = useState<Data>(() => ({ ...block.data }));
  const [images, setImages] = useState<Images>(() => ({ ...block.images }));
  const errors = validate(schema.fields, data);
  const valid = Object.keys(errors).length === 0;
  const dirty = useMemo(() => JSON.stringify(data) !== JSON.stringify(saved), [data, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const replaceInCache = (next: HomeBlock) =>
    client.setQueryData<HomeBlock[]>(
      contentKeys.blocks,
      (list) => list?.map((b) => (b.kind === next.kind ? next : b)) ?? list,
    );

  const save = useMutation({
    mutationFn: (value: Data) => homeApi.patch(kind, { data: value }),
    onSuccess: (next, value) => {
      replaceInCache(next);
      setSaved(value);
      setImages((m) => ({ ...m, ...next.images }));
      toast.success("Блок сохранён — изменения уже на главной");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const visibility = useMutation({
    mutationFn: (visible: boolean) => homeApi.patch(kind, { is_visible: visible }),
    onSuccess: (next) => {
      replaceInCache(next);
      toast.success(next.is_visible ? "Блок снова на главной" : "Блок скрыт с главной");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onImage = (m: Media) => setImages((all) => ({ ...all, [m.id]: m }));
  const set = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));

  const status = save.isPending
    ? "Сохраняем…"
    : !valid
      ? "Исправьте поля с ошибкой — потом можно сохранить"
      : dirty
        ? "Есть несохранённые изменения — нажмите «Сохранить блок»"
        : "Изменений нет";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/home", label: "Все блоки" }}
        title={block.label}
        description={
          <>
            {block.is_visible ? (
              <StatusBadge tone="success">На главной</StatusBadge>
            ) : (
              <StatusBadge>Скрыт</StatusBadge>
            )}{" "}
            {schema.description}
          </>
        }
        actions={
          <>
            {schema.preview ? (
              <PreviewButton note="Так блок будет выглядеть на главной — с вашими несохранёнными правками.">
                {() => <BlockPreview kind={kind} data={data} images={images} />}
              </PreviewButton>
            ) : null}
            <Button asChild variant="outline">
              <a href="/" target="_blank" rel="noopener">
                <ExternalLink aria-hidden="true" />
                Открыть главную
              </a>
            </Button>
          </>
        }
      />

      <div className="flex max-w-3xl flex-col gap-5">
        <Label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-card px-4 font-normal">
          <span className="text-[15px]">Показывать этот блок на главной</span>
          <Switch
            checked={block.is_visible}
            disabled={visibility.isPending}
            onCheckedChange={(v) => visibility.mutate(v)}
            aria-label={`Показывать на главной: ${block.label}`}
          />
        </Label>

        {schema.auto ? (
          <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-[15px] text-sky-950">
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              {schema.auto.text}{" "}
              <Link href={schema.auto.href} className="font-medium underline underline-offset-2">
                {schema.auto.linkLabel}
              </Link>
            </p>
          </div>
        ) : null}

        <SectionCard title="Содержимое блока" id="block-fields">
          <div className="flex flex-col gap-5">
            {schema.fields.map((field) =>
              field.type === "items" ? (
                <ItemsField
                  key={field.key}
                  field={field}
                  value={data[field.key]}
                  onChange={(v) => set(field.key, v)}
                  images={images}
                  onImage={onImage}
                  errors={errors}
                />
              ) : (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={data[field.key]}
                  onChange={(v) => set(field.key, v)}
                  images={images}
                  onImage={onImage}
                  error={errors[field.key]}
                />
              ),
            )}
          </div>
        </SectionCard>
      </div>

      <SaveBar status={status}>
        <Button
          type="button"
          size="lg"
          disabled={!valid || !dirty || save.isPending}
          onClick={() => save.mutate(data)}
        >
          Сохранить блок
        </Button>
      </SaveBar>
    </>
  );
}

function NotFound() {
  return (
    <>
      <PageHeader back={{ href: "/admin/content/home", label: "Все блоки" }} title="Блок главной" />
      <EmptyState title="Такого блока нет">
        Вернитесь к списку блоков главной и выберите блок там.
      </EmptyState>
    </>
  );
}

function EditorLoader({ kind }: { kind: string }) {
  const list = useQuery({
    queryKey: contentKeys.blocks,
    queryFn: async () => [...(await homeApi.list())].sort((a, b) => a.sort_order - b.sort_order),
    refetchOnWindowFocus: false,
  });
  if (!isBlockKind(kind)) return <NotFound />;
  return (
    <QueryState query={list}>
      {(blocks) => {
        const block = blocks.find((b) => b.kind === kind) ?? {
          kind,
          label: BLOCK_SCHEMAS[kind].label,
          data: {},
          images: {},
          sort_order: blocks.length,
          is_visible: true,
        };
        return <BlockForm key={kind} block={block} kind={kind} />;
      }}
    </QueryState>
  );
}

export function HomeBlockEditor({ kind }: { kind: string }) {
  return (
    <RequirePermission permission="content">
      <EditorLoader kind={kind} />
    </RequirePermission>
  );
}
