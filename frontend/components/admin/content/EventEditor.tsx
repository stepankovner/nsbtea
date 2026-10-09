"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { MoneyField } from "@/components/admin/MoneyField";
import { PageHeader, QueryState, SectionCard, StatusBadge } from "@/components/admin/page";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EventRow } from "@/components/shop/events/EventRow";
import { Picture } from "@/components/shop/Picture";
import { RichText } from "@/components/shop/RichText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Schemas } from "@/lib/api/client";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import {
  contentKeys,
  EVENT_TYPES,
  eventPath,
  eventPreview,
  eventsApi,
  fromMoscow,
  isEmptyDoc,
  isPast,
  seatsSummary,
  slugError,
  toMoscow,
  type AdminEvent,
  type EventType,
  type Media,
} from "@/lib/admin/content";
import { cn } from "@/lib/utils";

import { SlugField } from "./PageFields";
import { PreviewButton, RequirePermission, SaveBar } from "./shared";

interface Form {
  type: EventType;
  title: string;
  slug: string;
  date: string;
  time: string;
  end_time: string;
  duration_text: string;
  place: string;
  price_kop: number | null;
  price_text: string;
  seats_total: string;
  note: string;
  cover: Media | null;
  short_description: string;
  description: unknown;
}

const EMPTY: Form = {
  type: "ceremony",
  title: "",
  slug: "",
  date: "",
  time: "",
  end_time: "",
  duration_text: "",
  place: "",
  price_kop: null,
  price_text: "",
  seats_total: "",
  note: "",
  cover: null,
  short_description: "",
  description: null,
};

function fromEvent(e: AdminEvent, copy = false): Form {
  const start = toMoscow(e.starts_at);
  const end = toMoscow(e.ends_at);
  return {
    type: (EVENT_TYPES.some((t) => t.value === e.type) ? e.type : "other") as EventType,
    title: e.title,
    slug: copy ? "" : e.slug,
    date: copy ? "" : start.date,
    time: start.time,
    end_time: end.time,
    duration_text: e.duration_text ?? "",
    place: e.place ?? "",
    price_kop: e.price_kop,
    price_text: e.price_text ?? "",
    seats_total: e.seats_total === null ? "" : String(e.seats_total),
    note: e.note ?? "",
    cover: e.cover,
    short_description: e.short_description ?? "",
    description: e.description,
  };
}

const opt = (v: string) => v.trim() || null;

function toBody(form: Form) {
  return {
    type: form.type,
    title: form.title.trim(),
    starts_at: fromMoscow(form.date, form.time) ?? "",
    ends_at: form.end_time ? fromMoscow(form.date, form.end_time) : null,
    duration_text: opt(form.duration_text),
    place: opt(form.place),
    price_kop: form.price_kop,
    price_text: opt(form.price_text),
    seats_total: form.seats_total.trim() ? Number(form.seats_total) : null,
    note: opt(form.note),
    cover_media_id: form.cover?.id ?? null,
    short_description: opt(form.short_description),
    description: isEmptyDoc(form.description)
      ? null
      : (form.description as Record<string, unknown>),
  } satisfies Schemas["EventPatch"];
}

/** Ошибки: «обязательные» — после первой попытки сохранить, остальные — сразу. */
function validate(form: Form, submitted: boolean, slugRequired: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (submitted && !form.title.trim()) errors.title = "Введите название события";
  if (submitted && !fromMoscow(form.date, form.time)) errors.date = "Укажите дату и время начала";
  if (form.end_time && form.time && form.end_time <= form.time)
    errors.end_time = "Окончание должно быть позже начала";
  if (
    form.seats_total.trim() &&
    !(Number(form.seats_total) >= 0 && Number(form.seats_total) <= 10_000)
  ) {
    errors.seats_total = "Число мест — от 0 до 10 000";
  }
  if (slugRequired && !form.slug.trim()) errors.slug = "Укажите адрес, например splav-po-klyazme";
  const slug = slugError(form.slug, "event");
  if (slug) errors.slug = slug;
  return errors;
}

function isComplete(form: Form, slugRequired: boolean) {
  return Object.keys(validate(form, true, slugRequired)).length === 0;
}

// ------------------------------------------------------------------ предпросмотр

function EventPreview({ form, seatsTaken }: { form: Form; seatsTaken: number }) {
  const body = toBody(form);
  const e = eventPreview({
    ...body,
    slug: form.slug,
    starts_at: body.starts_at || null,
    seats_taken: seatsTaken,
    cover: form.cover,
    description: body.description,
  });
  return (
    <div className="container-site flex flex-col gap-10 py-8">
      <section className="flex flex-col gap-2">
        <span className="label-mono text-muted">В расписании на сайте</span>
        <EventRow event={e} />
      </section>
      <section className="flex flex-col gap-2">
        <span className="label-mono text-muted">Страница события</span>
        <article className="grid gap-x-10 gap-y-8 border-t border-line pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <span className="kicker text-green">
              {e.type_label} · {e.day} {e.month_label}, {e.weekday}, {e.time}
            </span>
            <h1 className="font-serif text-[clamp(36px,5vw,72px)] leading-[0.98]">{e.title}</h1>
            <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-[17px]">
              {(
                [
                  ["Где", e.place],
                  ["Сколько длится", e.duration_text],
                  ["Стоимость", e.price_label],
                  ["Места", e.seats_label],
                ] as const
              ).map(([k, v]) =>
                v ? (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            {e.short_description ? (
              <p className="text-[17px] leading-[1.65] text-text2">{e.short_description}</p>
            ) : null}
            <RichText doc={e.description} />
          </div>
          {e.cover ? (
            <div className="aspect-[4/5] overflow-hidden bg-photo">
              <Picture media={e.cover} alt={e.title} sizes="40vw" />
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ форма

type SetField = <K extends keyof Form>(key: K, value: Form[K]) => void;

/*
 * Форма разбита на секции под memo: при наборе названия не перерисовываются
 * редактор описания и загрузка фото — на слабом телефоне это заметно.
 */

const MainSection = memo(function MainSection({
  type,
  title,
  date,
  time,
  endTime,
  duration,
  place,
  titleError,
  dateError,
  endError,
  set,
}: {
  type: EventType;
  title: string;
  date: string;
  time: string;
  endTime: string;
  duration: string;
  place: string;
  titleError?: string;
  dateError?: string;
  endError?: string;
  set: SetField;
}) {
  const starts = fromMoscow(date, time);
  const pastNote =
    starts && isPast(starts)
      ? "Эта дата уже прошла — событие сразу попадёт в «Прошедшие»"
      : undefined;
  const typeLabel = useId();
  const titleId = useId();
  const dateId = useId();
  const timeId = useId();
  const endId = useId();
  const durationId = useId();
  const placeId = useId();
  return (
    <SectionCard title="Главное" id="event-main" className="order-1 lg:order-none">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2" role="group" aria-labelledby={typeLabel}>
          <span id={typeLabel} className="text-[15px] font-medium">
            Что это за событие
          </span>
          <RadioGroup
            value={type}
            onValueChange={(v) => set("type", v as EventType)}
            className="grid gap-2 sm:grid-cols-2"
          >
            {EVENT_TYPES.map((t) => (
              <Label
                key={t.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 font-normal",
                  type === t.value && "border-foreground",
                )}
              >
                <RadioGroupItem value={t.value} aria-label={t.label} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{t.label}</span>
                  <span className="text-sm text-muted-foreground">{t.example}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>
        <Field
          id={titleId}
          label="Название события"
          error={titleError}
          hint="Как событие будет называться в расписании. Например: «Церемония „Осенние улуны“»."
        >
          <Input
            id={titleId}
            value={title}
            maxLength={200}
            onChange={(e) => set("title", e.target.value)}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={describedBy(titleId, titleError)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={dateId} label="Дата" error={dateError} description={pastNote}>
            <Input
              id={dateId}
              type="date"
              value={date}
              onChange={(e) => set("date", e.target.value)}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={describedBy(dateId, dateError, pastNote)}
            />
          </Field>
          <Field id={timeId} label="Время начала" description="По московскому времени">
            <Input
              id={timeId}
              type="time"
              step={300}
              value={time}
              onChange={(e) => set("time", e.target.value)}
              aria-describedby={describedBy(timeId, null, true)}
            />
          </Field>
          <Field
            id={endId}
            label="Время окончания"
            error={endError}
            hint="Необязательно. Например, начало в 19:00, окончание в 21:00. Поисковики покажут событие точнее."
          >
            <Input
              id={endId}
              type="time"
              step={300}
              value={endTime}
              onChange={(e) => set("end_time", e.target.value)}
              aria-invalid={endError ? true : undefined}
              aria-describedby={describedBy(endId, endError)}
            />
          </Field>
        </div>
        <Field
          id={durationId}
          label="Сколько длится"
          hint="Как написать на сайте, например «около 2 часов» или «4 часа с чаем на берегу»."
        >
          <Input
            id={durationId}
            value={duration}
            maxLength={80}
            onChange={(e) => set("duration_text", e.target.value)}
          />
        </Field>
        <Field
          id={placeId}
          label="Место"
          hint="Где встречаемся, например «Владимир, ул. Большая Московская, 1» или «Клязьма, лодочная станция»."
        >
          <Input
            id={placeId}
            value={place}
            maxLength={200}
            onChange={(e) => set("place", e.target.value)}
          />
        </Field>
      </div>
    </SectionCard>
  );
});

const DescriptionSection = memo(function DescriptionSection({
  short,
  description,
  set,
}: {
  short: string;
  description: unknown;
  set: SetField;
}) {
  const shortId = useId();
  const onDescription = useCallback((doc: unknown) => set("description", doc), [set]);
  return (
    <SectionCard title="Описание" id="event-description" className="order-3 lg:order-none">
      <div className="flex flex-col gap-5">
        <Field
          id={shortId}
          label="Коротко о событии"
          description={`${short.trim().length} из 1000`}
          hint="Одно-два предложения под заголовком события и в превью ссылки в Telegram и ВКонтакте. Например: «Несколько часов по реке и чай на берегу»."
        >
          <Textarea
            id={shortId}
            value={short}
            maxLength={1000}
            onChange={(e) => set("short_description", e.target.value)}
            aria-describedby={describedBy(shortId, null, true)}
          />
        </Field>
        <RichTextEditor
          label="Подробное описание"
          value={description}
          onChange={onDescription}
          hint="Программа, какие чаи будут, что взять с собой и как добраться. Можно добавить фото и карточку товара."
        />
      </div>
    </SectionCard>
  );
});

const PriceSection = memo(function PriceSection({
  priceKop,
  priceText,
  seats,
  note,
  seatsTaken,
  seatsError,
  set,
}: {
  priceKop: number | null;
  priceText: string;
  seats: string;
  note: string;
  seatsTaken: number;
  seatsError?: string;
  set: SetField;
}) {
  const priceTextId = useId();
  const seatsId = useId();
  const noteId = useId();
  const seatsNote = seatsTaken ? `Уже записались: ${seatsTaken}` : undefined;
  return (
    <SectionCard title="Цена и запись" id="event-price" className="order-2 lg:order-none">
      <div className="flex flex-col gap-5">
        <MoneyField
          label="Цена"
          value={priceKop}
          onChange={(kop) => set("price_kop", kop)}
          hint="Сумма с человека, например 1500. Её увидят поисковики. Если бесплатно — оставьте пустым и напишите «Бесплатно» в поле ниже."
        />
        <Field
          id={priceTextId}
          label="Как написать цену на сайте"
          hint="Если хочется по-своему: «1 500 ₽ с человека», «от 2 000 ₽», «Бесплатно, по записи». Если пусто — покажем сумму из поля «Цена»."
        >
          <Input
            id={priceTextId}
            value={priceText}
            maxLength={120}
            onChange={(e) => set("price_text", e.target.value)}
          />
        </Field>
        <Field
          id={seatsId}
          label="Сколько мест"
          error={seatsError}
          description={seatsNote}
          hint="Например, 8. Считаем гостей из заявок: когда места закончатся, кнопка «Записаться» на сайте пропадёт. Оставьте пустым, если мест сколько угодно."
        >
          <Input
            id={seatsId}
            inputMode="numeric"
            className="max-w-32"
            value={seats}
            onChange={(e) => set("seats_total", e.target.value.replace(/[^\d]/g, ""))}
            aria-invalid={seatsError ? true : undefined}
            aria-describedby={describedBy(seatsId, seatsError, seatsNote)}
          />
        </Field>
        <Field
          id={noteId}
          label="Пометка"
          hint="Короткая красная надпись рядом с видом события, например «Закрытие сезона» или «Последние места». Можно не заполнять."
        >
          <Input
            id={noteId}
            value={note}
            maxLength={120}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
      </div>
    </SectionCard>
  );
});

const CoverSection = memo(function CoverSection({
  cover,
  slug,
  title,
  slugError: slugProblem,
  slugOptional,
  set,
}: {
  cover: Media | null;
  slug: string;
  title: string;
  slugError?: string;
  slugOptional: boolean;
  set: SetField;
}) {
  return (
    <SectionCard title="Обложка и адрес" id="event-cover" className="order-4 lg:order-none">
      <div className="flex flex-col gap-5">
        <ImageUpload
          label="Обложка"
          value={cover}
          onChange={(m) => set("cover", m)}
          aspect="aspect-[4/5]"
          hint="Вертикальное фото 4:5 — так оно стоит на странице события. Оно же покажется в превью ссылки в мессенджерах."
        />
        <SlugField
          label="Адрес страницы события"
          prefix="/events/"
          value={slug}
          onChange={(v) => set("slug", v)}
          title={title}
          error={slugProblem}
          optional={slugOptional}
          example={EVENT_SLUG_EXAMPLE}
        />
      </div>
    </SectionCard>
  );
});

const EVENT_SLUG_EXAMPLE = { title: "Сплав по Клязьме", slug: "splav-po-klyazme" };

function EventFields({
  form,
  set,
  errors,
  seatsTaken,
  slugOptional,
  extra,
}: {
  form: Form;
  set: SetField;
  errors: Record<string, string>;
  seatsTaken: number;
  slugOptional: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <MainSection
          type={form.type}
          title={form.title}
          date={form.date}
          time={form.time}
          endTime={form.end_time}
          duration={form.duration_text}
          place={form.place}
          titleError={errors.title}
          dateError={errors.date}
          endError={errors.end_time}
          set={set}
        />
        <DescriptionSection
          short={form.short_description}
          description={form.description}
          set={set}
        />
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <PriceSection
          priceKop={form.price_kop}
          priceText={form.price_text}
          seats={form.seats_total}
          note={form.note}
          seatsTaken={seatsTaken}
          seatsError={errors.seats_total}
          set={set}
        />
        <CoverSection
          cover={form.cover}
          slug={form.slug}
          title={form.title}
          slugError={errors.slug}
          slugOptional={slugOptional}
          set={set}
        />
        {extra}
      </div>
    </div>
  );
}

function useFormState(initial: Form) {
  const [form, setForm] = useState<Form>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // стабильная функция — чтобы секции формы под memo не перерисовывались зря
  const set = useCallback<SetField>((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    const field = key === "time" ? "date" : key;
    setServer((all) => {
      if (!all[field]) return all;
      const next = { ...all };
      delete next[field];
      return next;
    });
  }, []);
  function fail(e: unknown) {
    const fields = e instanceof ApiError ? fieldErrors(e) : {};
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields))
      mapped[k === "starts_at" ? "date" : k === "cover_media_id" ? "cover" : k] = v;
    setServer(mapped);
    setError(Object.keys(mapped).length ? null : errorMessage(e));
  }
  return { form, setForm, set, submitted, setSubmitted, server, setServer, error, setError, fail };
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p
      role="alert"
      className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-[15px] text-destructive"
    >
      {error}
    </p>
  ) : null;
}

// ------------------------------------------------------------------ создание

function CreateForm({ initial }: { initial: Form }) {
  const router = useRouter();
  const client = useQueryClient();
  const s = useFormState(initial);
  const errors = { ...s.server, ...validate(s.form, s.submitted, false) };

  const create = useMutation({
    mutationFn: (publish: boolean) =>
      eventsApi.create({ ...toBody(s.form), slug: opt(s.form.slug), is_published: publish }),
    onSuccess: (event) => {
      void client.invalidateQueries({ queryKey: contentKeys.events });
      client.setQueryData(contentKeys.event(event.id), event);
      toast.success(
        event.is_published
          ? "Событие опубликовано — оно уже в расписании на сайте"
          : "Черновик события сохранён",
      );
      router.replace(`/admin/content/events/${event.id}`);
    },
    onError: s.fail,
  });

  function submit(publish: boolean) {
    s.setSubmitted(true);
    s.setError(null);
    if (!isComplete(s.form, false)) return;
    create.mutate(publish);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <PreviewButton>{() => <EventPreview form={s.form} seatsTaken={0} />}</PreviewButton>
      </div>
      <EventFields form={s.form} set={s.set} errors={errors} seatsTaken={0} slugOptional />
      <ErrorNote error={s.error} />
      <SaveBar
        status={
          s.submitted && !isComplete(s.form, false)
            ? "Заполните поля, отмеченные красным"
            : "Событие появится на сайте после публикации"
        }
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={create.isPending}
          onClick={() => submit(false)}
        >
          Сохранить черновик
        </Button>
        <Button type="button" size="lg" disabled={create.isPending} onClick={() => submit(true)}>
          Опубликовать
        </Button>
      </SaveBar>
    </>
  );
}

export function EventCreate() {
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/events", label: "Все события" }}
        title="Новое событие"
        description="Церемония, сплав или лекция. Дата и время — по Москве."
      />
      <RequirePermission permission="content">
        <CreateLoader />
      </RequirePermission>
    </>
  );
}

function CreateLoader() {
  const params = useSearchParams();
  const copyId = params.get("copy");
  const source = useQuery({
    queryKey: contentKeys.event(copyId ?? ""),
    queryFn: () => eventsApi.get(copyId!),
    enabled: Boolean(copyId),
  });
  if (!copyId) return <CreateForm initial={EMPTY} />;
  return (
    <QueryState query={source}>
      {(event) => (
        <>
          <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-[15px] text-sky-950">
            Копия события «{event.title}»: всё заполнено как в нём. Выберите новую дату и
            опубликуйте.
          </p>
          <CreateForm key={event.id} initial={fromEvent(event, true)} />
        </>
      )}
    </QueryState>
  );
}

// ------------------------------------------------------------------ изменение

function EditForm({ event }: { event: AdminEvent }) {
  const router = useRouter();
  const client = useQueryClient();
  const [initial] = useState(() => fromEvent(event));
  const s = useFormState(initial);
  const [saved, setSaved] = useState(initial);
  const errors = { ...s.server, ...validate(s.form, true, true) };
  const valid = isComplete(s.form, true);
  const dirty = useMemo(() => JSON.stringify(s.form) !== JSON.stringify(saved), [s.form, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const apply = (next: AdminEvent) => {
    client.setQueryData(contentKeys.event(event.id), next);
    void client.invalidateQueries({ queryKey: [...contentKeys.events, "list"] });
  };

  const save = useMutation({
    mutationFn: (value: Form) =>
      eventsApi.patch(event.id, { ...toBody(value), slug: value.slug.trim() }),
    onSuccess: (next, value) => {
      apply(next);
      setSaved(value);
      s.setServer({});
      s.setError(null);
      toast.success(next.is_published ? "Сохранено — изменения уже на сайте" : "Сохранено");
    },
    onError: s.fail,
  });
  const visibility = useMutation({
    mutationFn: (publish: boolean) => eventsApi.patch(event.id, { is_published: publish }),
    onSuccess: (next) => {
      apply(next);
      toast.success(next.is_published ? "Событие снова на сайте" : "Событие скрыто с сайта");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const seats = seatsSummary(event);
  const status = save.isPending
    ? "Сохраняем…"
    : !valid
      ? "Исправьте поля, отмеченные красным"
      : dirty
        ? event.is_published
          ? "Есть несохранённые изменения — на сайте их пока нет"
          : "Есть несохранённые изменения"
        : "Всё сохранено";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/events", label: "Все события" }}
        title={event.title}
        description={
          <>
            {event.is_published ? (
              <StatusBadge tone="success">На сайте</StatusBadge>
            ) : (
              <StatusBadge>Скрыто</StatusBadge>
            )}{" "}
            {event.is_past ? <StatusBadge>Прошло</StatusBadge> : null} {event.type_label}
          </>
        }
        actions={
          <>
            <PreviewButton>
              {() => <EventPreview form={s.form} seatsTaken={event.seats_taken} />}
            </PreviewButton>
            {event.is_published ? (
              <Button asChild variant="outline">
                <a href={eventPath(event.slug)} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden="true" />
                  Открыть на сайте
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/admin/content/events/new?copy=${event.id}`}>
                <Copy aria-hidden="true" />
                Создать копию
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={visibility.isPending}
              onClick={() => visibility.mutate(!event.is_published)}
            >
              {event.is_published ? "Скрыть с сайта" : "Показать на сайте"}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[15px]">
          <Users className="size-5 text-muted-foreground" aria-hidden="true" />
          {seats ?? "Пока никто не записался"}
          {event.seats_left !== null && event.seats_total !== null ? (
            <span className="text-muted-foreground">· осталось мест: {event.seats_left}</span>
          ) : null}
        </p>
        <Link
          href={`/admin/applications?event_id=${event.id}`}
          className="text-[15px] font-medium underline underline-offset-2"
        >
          Заявки на запись: {event.applications_count}
        </Link>
      </div>

      <EventFields
        form={s.form}
        set={s.set}
        errors={errors}
        seatsTaken={event.seats_taken}
        slugOptional={false}
        extra={
          <SectionCard title="Убрать событие" id="event-archive" className="order-5 lg:order-none">
            <div className="flex flex-col items-start gap-3">
              <p className="text-[15px] text-muted-foreground">
                Если нужно только спрятать событие — нажмите «Скрыть с сайта» вверху. Прошедшие
                события сами переезжают во вкладку «Прошедшие» — убирать их в архив не нужно.
              </p>
              <ConfirmAction
                trigger="Убрать в архив"
                title={`Убрать «${event.title}» в архив?`}
                description="Событие пропадёт с сайта и из списков событий. Заявки на него сохранятся в «Заявках». Вернуть событие можно во вкладке «Архив» — оно вернётся скрытым с сайта. Если нужна только пауза, лучше «Скрыть с сайта»."
                confirm="Да, убрать в архив"
                cancel="Не убирать"
                onConfirm={async () => {
                  await eventsApi.archive(event.id);
                  setSaved(s.form);
                  void client.invalidateQueries({ queryKey: contentKeys.events });
                  toast.success("Событие убрано в архив");
                  router.push("/admin/content/events");
                }}
              />
            </div>
          </SectionCard>
        }
      />
      <ErrorNote error={s.error} />

      <SaveBar status={status}>
        <Button
          type="button"
          size="lg"
          disabled={!valid || !dirty || save.isPending}
          onClick={() => save.mutate(s.form)}
        >
          Сохранить
        </Button>
      </SaveBar>
    </>
  );
}

export function EventEditor({ id }: { id: string }) {
  return (
    <RequirePermission permission="content">
      <EditLoader id={id} />
    </RequirePermission>
  );
}

function EditLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: contentKeys.event(id),
    queryFn: () => eventsApi.get(id),
    refetchOnWindowFocus: false,
  });
  return (
    <QueryState query={query}>{(event) => <EditForm key={event.id} event={event} />}</QueryState>
  );
}
