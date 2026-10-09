"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Picture } from "@/components/shop/Picture";
import { RichText } from "@/components/shop/RichText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import type { Schemas } from "@/lib/api/client";
import { AUTOSAVE_LABELS, useAutosave } from "@/lib/admin/autosave";
import {
  contentKeys,
  isSystemPage,
  pageKind,
  pagePath,
  pagesApi,
  SEO_DESCRIPTION_SOFT,
  SEO_TITLE_SOFT,
  SITE_NAME,
  slugError,
  SYSTEM_PAGES,
  type AdminPage,
  type Media,
  type PageKind,
} from "@/lib/admin/content";
import { formatDate, formatDayTime } from "@/lib/format";

import { KindPicker, SlugField, TitleField } from "./PageFields";
import { PreviewButton, RequirePermission, SaveBar } from "./shared";

interface Form {
  title: string;
  slug: string;
  kind: PageKind;
  content: unknown;
  excerpt: string;
  cover: Media | null;
  seo_title: string;
  seo_description: string;
  sort_order: string;
}

function toForm(page: AdminPage): Form {
  return {
    title: page.title,
    slug: page.slug,
    kind: pageKind(page.kind).value,
    content: page.content,
    excerpt: page.excerpt ?? "",
    cover: page.cover,
    seo_title: page.seo_title ?? "",
    seo_description: page.seo_description ?? "",
    sort_order: String(page.sort_order),
  };
}

function toPatch(form: Form, locked: boolean): Schemas["PagePatch"] {
  return {
    title: form.title.trim(),
    ...(locked ? {} : { slug: form.slug.trim(), kind: form.kind }),
    content: form.content as Record<string, unknown>,
    excerpt: form.excerpt.trim() || null,
    cover_media_id: form.cover?.id ?? null,
    seo_title: form.seo_title.trim() || null,
    seo_description: form.seo_description.trim() || null,
    sort_order: Number.parseInt(form.sort_order, 10) || 0,
  };
}

function validate(form: Form, locked: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) errors.title = "Введите название страницы";
  if (!locked) {
    if (!form.slug.trim()) errors.slug = "Укажите адрес страницы, например kak-zavarivat-puer";
    else {
      const problem = slugError(form.slug, form.kind);
      if (problem) errors.slug = problem;
    }
  }
  if (!/^\d{0,4}$/.test(form.sort_order.trim()))
    errors.sort_order = "Только целое число от 0, например 5";
  return errors;
}

const TextEditor = memo(RichTextEditor);

const same = (a: Form, b: Form) => a === b || JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ правки опубликованной страницы на устройстве

interface LocalDraft {
  form: Form;
  saved_at: string;
}

const draftKey = (id: string) => `nsb-admin:page-draft:${id}`;

function readDraft(id: string): LocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    return parsed && typeof parsed === "object" && parsed.form ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, form: Form) {
  try {
    window.localStorage.setItem(
      draftKey(id),
      JSON.stringify({ form, saved_at: new Date().toISOString() } satisfies LocalDraft),
    );
  } catch {
    // место в браузере закончилось или запрещено — просто не храним
  }
}

function clearDraft(id: string) {
  try {
    window.localStorage.removeItem(draftKey(id));
  } catch {
    // нечего очищать
  }
}

// ------------------------------------------------------------------ части экрана

/** Текст документа без разметки — так Яндекс возьмёт описание, если своего нет. */
function docText(doc: unknown, limit = 200): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || parts.join(" ").length > limit) return;
    const n = node as { text?: unknown; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    for (const child of n.content ?? []) walk(child);
  };
  walk(doc);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function hasProductCards(doc: unknown): boolean {
  return JSON.stringify(doc ?? null).includes('"productCard"');
}

function siteHost(page: AdminPage): string {
  try {
    return new URL(page.site_url).host;
  } catch {
    return "nsbtea.ru";
  }
}

function YandexSnippet({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description: string;
}) {
  return (
    <div
      data-testid="yandex-snippet"
      className="flex flex-col gap-1 rounded-lg border bg-white p-3 text-left"
    >
      <span className="truncate text-[13px] text-emerald-800">{url}</span>
      <span className="text-[17px] leading-snug text-[#1a0dab]">{title}</span>
      <span className="text-sm leading-snug text-neutral-700">
        {description || "Яндекс возьмёт начало текста страницы."}
      </span>
    </div>
  );
}

function Counter({ value, soft, max }: { value: string; soft: number; max: number }) {
  const n = value.trim().length;
  return (
    <span className={n > soft ? "text-amber-700" : undefined}>
      {n} из {max}
      {n > soft ? ` — длиннее ${soft} знаков Яндекс обрежет` : ""}
    </span>
  );
}

function PagePreview({ form, updatedAt }: { form: Form; updatedAt: string }) {
  const kicker =
    form.kind === "guide" ? "Как заваривать" : form.kind === "legal" ? "Документы" : null;
  return (
    <article className="container-site pb-16 pt-10">
      {kicker ? <span className="kicker mb-6 block text-green">{kicker}</span> : null}
      <h1 className="mb-8 max-w-[1000px] font-serif text-[clamp(36px,6vw,80px)] leading-[0.98]">
        {form.title || "Без названия"}
      </h1>
      <div className="flex max-w-[720px] flex-col gap-8">
        {form.cover ? (
          <div className="aspect-[16/10] overflow-hidden bg-photo">
            <Picture media={form.cover} alt={form.title} sizes="720px" />
          </div>
        ) : null}
        <RichText doc={form.content} />
        {hasProductCards(form.content) ? (
          <p className="border border-dashed border-line p-3 font-mono text-xs text-muted">
            Карточки товаров из текста появятся на сайте — с фото, актуальной ценой и наличием.
          </p>
        ) : null}
        {form.kind === "legal" ? (
          <p className="font-mono text-xs text-muted">Редакция от {formatDate(updatedAt)}</p>
        ) : null}
      </div>
    </article>
  );
}

function LegalNotice({ required }: { required: boolean }) {
  return (
    <section
      aria-label="Правила для документов"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[15px] text-amber-950 md:p-5"
    >
      {required ? (
        <>
          <p className="mb-1 font-semibold">Обязательный документ</p>
          <p>
            Без опубликованных оферты, политики обработки персональных данных и согласия нельзя
            запускать магазин: на них ведут ссылки при оформлении заказа, в формах заявок и в
            полоске о cookies.
          </p>
        </>
      ) : (
        <p className="font-semibold">Юридический документ</p>
      )}
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
        {required ? <li>Удалить документ нельзя — только изменить текст.</li> : null}
        <li>
          Внизу документа на сайте пишется «Редакция от …» — это дата последнего сохранения. Пока
          документ на сайте, сохраняйте его, когда текст полностью готов.
        </li>
        <li>
          Текст готовит владелец магазина, лучше вместе с юристом. Проверьте, что в нём верные
          реквизиты ИП.
        </li>
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ форма

function PageForm({ page }: { page: AdminPage }) {
  const client = useQueryClient();
  const router = useRouter();
  const excerptId = useId();
  const seoTitleId = useId();
  const seoDescriptionId = useId();
  const orderId = useId();

  const system = isSystemPage(page.slug);
  const locked = system || page.required;
  const isDraft = !page.is_published;

  const [initial] = useState(() => toForm(page));
  const [form, setForm] = useState<Form>(initial);
  const [savedForm, setSavedForm] = useState<Form>(initial);
  const [editorKey, setEditorKey] = useState(0);
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(() => {
    if (!page.is_published) return null;
    const found = readDraft(page.id);
    return found && !same(found.form, initial) ? found : null;
  });
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const problems = validate(form, locked);
  const valid = Object.keys(problems).length === 0;
  const errors: Record<string, string> = { ...serverFields, ...problems };
  const dirty = useMemo(() => !same(form, savedForm), [form, savedForm]);

  // стабильная функция: редактор текста под memo не перерисовывается при наборе названия
  const update = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setServerFields((fields) => {
      if (!fields[key]) return fields;
      const next = { ...fields };
      delete next[key];
      return next;
    });
  }, []);
  const onContent = useCallback((doc: unknown) => update("content", doc), [update]);

  const applySaved = useCallback(
    (next: AdminPage, value: Form) => {
      client.setQueryData(contentKeys.page(page.id), next);
      void client.invalidateQueries({ queryKey: [...contentKeys.pages, "list"] });
      setSavedForm(value);
      setServerFields({});
      setServerError(null);
    },
    [client, page.id],
  );

  const applyError = useCallback((e: unknown) => {
    const fields = e instanceof ApiError ? fieldErrors(e) : {};
    setServerFields(fields);
    setServerError(Object.keys(fields).length ? null : errorMessage(e));
  }, []);

  // черновик (на сайте не виден) — сохраняется на сервер сам
  const saveDraft = useCallback(
    async (value: Form) => {
      try {
        applySaved(await pagesApi.patch(page.id, toPatch(value, locked)), value);
      } catch (e) {
        applyError(e);
        throw e;
      }
    },
    [applySaved, applyError, page.id, locked],
  );
  const auto = useAutosave(form, saveDraft, { enabled: isDraft && valid });

  // опубликованная страница — правки до нажатия «Сохранить» хранятся на этом устройстве
  const savedRef = useRef(savedForm);
  useEffect(() => {
    savedRef.current = savedForm;
  }, [savedForm]);
  const keepLocal = useCallback(
    async (value: Form) => {
      if (same(value, savedRef.current)) clearDraft(page.id);
      else writeDraft(page.id, value);
    },
    [page.id],
  );
  useAutosave(form, keepLocal, { enabled: !isDraft, delay: 800 });

  // ушли со страницы, не дождавшись автосохранения черновика, — сохраняем сразу
  const flushRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    flushRef.current = isDraft && valid ? () => void auto.flush() : () => undefined;
  });
  // при уходе нужен именно последний вариант flush — поэтому через ref
  useEffect(() => () => flushRef.current(), []);

  const unsaved = isDraft
    ? auto.status === "pending" || auto.status === "saving" || auto.status === "error"
    : dirty;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const save = useMutation({
    mutationFn: ({ value, extra }: { value: Form; extra?: Schemas["PagePatch"] }) =>
      pagesApi.patch(page.id, { ...toPatch(value, locked), ...extra }),
    onSuccess: (next, { value, extra }) => {
      applySaved(next, value);
      clearDraft(page.id);
      setLocalDraft(null);
      toast.success(
        extra?.is_published === true
          ? "Страница опубликована — её уже видно на сайте"
          : extra?.is_published === false
            ? "Страница снята с сайта и стала черновиком"
            : "Сохранено — изменения уже на сайте",
      );
    },
    onError: applyError,
  });

  let status: string;
  if (isDraft) {
    if (auto.status === "error")
      status =
        serverError ??
        (Object.keys(serverFields).length
          ? "Не сохранено — исправьте поле с ошибкой"
          : AUTOSAVE_LABELS.error);
    else if (!valid) status = "Пока есть ошибки в полях, черновик не сохраняется";
    else
      status =
        AUTOSAVE_LABELS[auto.status] || "Черновик — на сайте не виден. Всё сохраняется само.";
  } else if (serverError) status = serverError;
  else if (dirty)
    status =
      "Изменения ещё не на сайте — нажмите «Сохранить изменения». До этого они хранятся на этом устройстве.";
  else status = "Всё сохранено, страница на сайте.";

  const kind = pageKind(form.kind);
  const seoTitle = `${form.seo_title.trim() || form.title.trim() || "Без названия"} — ${SITE_NAME}`;
  const seoDescription =
    form.seo_description.trim() || form.excerpt.trim() || docText(form.content);
  const path = pagePath({ kind: form.kind, slug: form.slug.trim() || page.slug });

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/pages", label: "Все страницы" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {page.title}
            {page.is_published ? (
              <StatusBadge tone="success">На сайте</StatusBadge>
            ) : (
              <StatusBadge tone={page.required ? "danger" : "neutral"}>Черновик</StatusBadge>
            )}
          </span>
        }
        description={`${pageKind(page.kind).label} · изменена ${formatDate(page.updated_at)}`}
        actions={
          <>
            <PreviewButton>
              {() => <PagePreview form={form} updatedAt={page.updated_at} />}
            </PreviewButton>
            {page.is_published ? (
              <Button asChild variant="outline">
                <a href={pagePath(page)} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden="true" />
                  Открыть на сайте
                </a>
              </Button>
            ) : null}
            {page.is_published ? (
              <ConfirmAction
                trigger="Снять с сайта"
                title={`Снять «${page.title}» с сайта?`}
                description={
                  <>
                    <p>
                      Страница пропадёт с сайта, ссылки на неё перестанут открываться. Текст
                      сохранится — опубликовать снова можно в любой момент.
                    </p>
                    {page.required ? (
                      <p className="mt-2 font-medium text-red-800">
                        Это обязательный документ: пока он скрыт, ссылки на него при оформлении
                        заказа и в формах заявок не откроются.
                      </p>
                    ) : null}
                  </>
                }
                confirm="Да, снять с сайта"
                cancel="Оставить на сайте"
                disabled={!valid}
                onConfirm={() => save.mutateAsync({ value: form, extra: { is_published: false } })}
              />
            ) : null}
          </>
        }
      />

      {localDraft ? (
        <div
          role="alert"
          className="mb-5 flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-[15px]">
            <History className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            На этом устройстве остались несохранённые правки от {formatDayTime(localDraft.saved_at)}
            . Вернуть их в редактор?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => {
                setForm(localDraft.form);
                setEditorKey((k) => k + 1);
                setLocalDraft(null);
              }}
            >
              Вернуть правки
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clearDraft(page.id);
                setLocalDraft(null);
              }}
            >
              Не нужно
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {form.kind === "legal" || page.required ? <LegalNotice required={page.required} /> : null}

        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-5">
            <SectionCard title="Текст" id="page-text">
              <div className="flex flex-col gap-5">
                <TitleField
                  value={form.title}
                  onChange={(v) => update("title", v)}
                  error={errors.title}
                />
                <TextEditor
                  key={editorKey}
                  label="Текст страницы"
                  value={form.content}
                  onChange={onContent}
                  hint="Пишите как в обычном редакторе: выделите слова и нажмите «Жирный» или «Ссылка». Кнопка с коробкой вставляет карточку товара с ценой — например, чтобы в гайде по гунфу сразу предложить подходящий улун."
                />
              </div>
            </SectionCard>

            <SectionCard title="Обложка и описание" id="page-cover">
              <div className="flex flex-col gap-5">
                <ImageUpload
                  label="Обложка"
                  value={form.cover}
                  onChange={(m) => update("cover", m)}
                  aspect="aspect-[16/10]"
                  hint="Большое фото над текстом. Оно же покажется в превью ссылки в Telegram и ВКонтакте. Лучше горизонтальное, например 1600×1000. Можно без обложки."
                />
                <Field
                  id={excerptId}
                  label="Короткое описание"
                  description={`${form.excerpt.trim().length} из 600`}
                  hint="Одно-два предложения о странице. Видно в списке гайдов «Как заваривать» и в превью ссылки в мессенджерах. Например: «Короткие проливы в гайвани — для пуэров и улунов»."
                >
                  <Textarea
                    id={excerptId}
                    value={form.excerpt}
                    maxLength={600}
                    onChange={(e) => update("excerpt", e.target.value)}
                    aria-describedby={describedBy(excerptId, null, true)}
                  />
                </Field>
              </div>
            </SectionCard>
          </div>

          <div className="flex flex-col gap-5">
            <SectionCard title="Адрес и место на сайте" id="page-address">
              <div className="flex flex-col gap-5">
                {locked ? null : (
                  <KindPicker compact value={form.kind} onChange={(k) => update("kind", k)} />
                )}
                <SlugField
                  value={form.slug}
                  onChange={(v) => update("slug", v)}
                  kind={form.kind}
                  title={form.title}
                  error={errors.slug}
                  locked={locked}
                  optional={false}
                  description={
                    locked
                      ? `На эту страницу ведут ссылки с сайта (${SYSTEM_PAGES[page.slug] ?? "служебная страница"}) — адрес менять нельзя.`
                      : `Ссылка на сайте: ${siteHost(page)}${path}`
                  }
                />
                <Field
                  id={orderId}
                  label="Порядок в списке"
                  error={errors.sort_order}
                  hint={`Чем меньше число, тем выше страница в подвале сайта и в списке «${kind.group}». Например: 1 — первой, 100 — в конце.`}
                >
                  <Input
                    id={orderId}
                    inputMode="numeric"
                    value={form.sort_order}
                    onChange={(e) => update("sort_order", e.target.value.replace(/[^\d]/g, ""))}
                    aria-invalid={errors.sort_order ? true : undefined}
                    aria-describedby={describedBy(orderId, errors.sort_order)}
                    className="max-w-32"
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Как страницу увидят в Яндексе" id="page-seo">
              <div className="flex flex-col gap-5">
                <YandexSnippet
                  title={seoTitle}
                  url={`${siteHost(page)}${path}`}
                  description={seoDescription}
                />
                <Field
                  id={seoTitleId}
                  label="Заголовок для Яндекса"
                  description={<Counter value={form.seo_title} soft={SEO_TITLE_SOFT} max={200} />}
                  hint={`Синяя ссылка в результатах поиска и название вкладки браузера. Если пусто — возьмём название страницы. Лучше до ${SEO_TITLE_SOFT} знаков, например «Доставка чая по Владимиру и России».`}
                >
                  <Input
                    id={seoTitleId}
                    value={form.seo_title}
                    maxLength={200}
                    placeholder={form.title}
                    onChange={(e) => update("seo_title", e.target.value)}
                    aria-describedby={describedBy(seoTitleId, null, true)}
                  />
                </Field>
                <Field
                  id={seoDescriptionId}
                  label="Описание для Яндекса"
                  description={
                    <Counter value={form.seo_description} soft={SEO_DESCRIPTION_SOFT} max={400} />
                  }
                  hint={`Серый текст под ссылкой в поиске. Если пусто — возьмём короткое описание или начало текста. Лучше одно-два предложения до ${SEO_DESCRIPTION_SOFT} знаков, например «Курьером по Владимиру за день, по России — СДЭК. Оплата картой или через СБП».`}
                >
                  <Textarea
                    id={seoDescriptionId}
                    value={form.seo_description}
                    maxLength={400}
                    onChange={(e) => update("seo_description", e.target.value)}
                    aria-describedby={describedBy(seoDescriptionId, null, true)}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Убрать страницу" id="page-archive">
              {page.required ? (
                <p className="text-[15px] text-muted-foreground">
                  Эту страницу нельзя убрать в архив — она обязательна для работы магазина. Её можно
                  только изменить.
                </p>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-[15px] text-muted-foreground">
                    Страница пропадёт с сайта, но не удалится — её можно вернуть из архива.
                  </p>
                  <ConfirmAction
                    trigger="Убрать в архив"
                    title={`Убрать «${page.title}» в архив?`}
                    description={
                      system
                        ? `Страница пропадёт с сайта, и перестанет работать ${SYSTEM_PAGES[page.slug]}. Её можно восстановить в любой момент: «Страницы → Архив».`
                        : "Страница пропадёт с сайта и из списка страниц. Её можно восстановить в любой момент: «Страницы → Архив»."
                    }
                    confirm="Да, убрать в архив"
                    cancel="Не убирать"
                    onConfirm={async () => {
                      await pagesApi.archive(page.id);
                      clearDraft(page.id);
                      setSavedForm(form);
                      void client.invalidateQueries({ queryKey: contentKeys.pages });
                      toast.success("Страница убрана в архив");
                      router.push("/admin/content/pages");
                    }}
                  />
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      <SaveBar status={status}>
        {isDraft ? (
          <Button
            type="button"
            size="lg"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate({ value: form, extra: { is_published: true } })}
          >
            Опубликовать
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={!valid || !dirty || save.isPending}
            onClick={() => save.mutate({ value: form })}
          >
            {save.isPending ? "Сохраняем…" : "Сохранить изменения"}
          </Button>
        )}
      </SaveBar>
    </>
  );
}

export function PageEditor({ id }: { id: string }) {
  return (
    <RequirePermission permission="content">
      <PageLoader id={id} />
    </RequirePermission>
  );
}

function PageLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: contentKeys.page(id),
    queryFn: () => pagesApi.get(id),
    refetchOnWindowFocus: false,
  });
  return <QueryState query={query}>{(page) => <PageForm key={page.id} page={page} />}</QueryState>;
}
