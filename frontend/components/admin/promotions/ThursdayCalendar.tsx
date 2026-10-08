"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { describedBy, Field } from "@/components/admin/Field";
import { PageHeader, QueryState, StatusBadge } from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  moscowToday,
  parsePercent,
  PERCENT_ERROR,
  promotionKeys,
  promotionsApi,
  THURSDAY_MODE_TEXT,
  thursdayPeriodText,
  type Thursday,
  type ThursdayBody,
  type ThursdayCalendar as Calendar,
} from "@/lib/admin/promotions";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

import { NoAccess, ProductThumb } from "./fields";

const MAX_PRODUCTS = 20;

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: promotionKeys.thursdays });
    void client.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

function ThursdayEditor({ thursday, defaultPercent, onDone }: { thursday: Thursday; defaultPercent: number; onDone: () => void }) {
  const refresh = useRefresh();
  const percentId = useId();
  const noteId = useId();
  const [ids, setIds] = useState(thursday.products.map((p) => p.id));
  const [custom, setCustom] = useState(thursday.custom_percent !== null);
  const [percent, setPercent] = useState(thursday.custom_percent !== null ? String(thursday.custom_percent) : "");
  const [note, setNote] = useState(thursday.note ?? "");
  const [percentError, setPercentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: ThursdayBody) => promotionsApi.saveThursday(thursday.date, body),
    onSuccess: () => {
      refresh();
      toast.success(`Чай недели на ${thursday.label} запланирован`);
      onDone();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function submit() {
    let value: number | null = null;
    if (custom) {
      value = parsePercent(percent);
      if (value === null) {
        setPercentError(PERCENT_ERROR);
        return;
      }
    }
    setPercentError(null);
    setError(null);
    save.mutate({ product_ids: ids, percent: value, note: note.trim() || null });
  }

  return (
    <div className="flex flex-col gap-4">
      <ProductPicker
        label={`Чай на ${thursday.label}`}
        value={ids}
        onChange={setIds}
        max={MAX_PRODUCTS}
        hint="Чай, на который в этот четверг будет скидка. Например: Да Хун Пао и Те Гуань Инь. Можно до 20 товаров."
      />
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-medium">Скидка</span>
        <RadioGroup value={custom ? "custom" : "default"} onValueChange={(v) => setCustom(v === "custom")} className="gap-2" aria-label="Скидка">
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[15px] font-normal">
            <RadioGroupItem value="default" aria-label={`Общая скидка — ${defaultPercent}%`} />
            Общая скидка — {defaultPercent}%
          </Label>
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[15px] font-normal">
            <RadioGroupItem value="custom" aria-label="Своя скидка" />
            Своя скидка
          </Label>
        </RadioGroup>
      </div>
      {custom ? (
        <Field
          id={percentId}
          label="Своя скидка, %"
          error={percentError}
          hint="Только для этого четверга, вместо общей. Целое число от 1 до 99, например 30."
        >
          <div className="relative max-w-40">
            <Input
              id={percentId}
              inputMode="numeric"
              autoComplete="off"
              value={percent}
              onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ""))}
              aria-invalid={percentError ? true : undefined}
              aria-describedby={describedBy(percentId, percentError)}
              className="pr-9 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
          </div>
        </Field>
      ) : null}
      <Field id={noteId} label="Заметка для себя" hint="Покупатели её не увидят. Например: «распродаём остатки весеннего урожая».">
        <Input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="w-full sm:w-auto" onClick={submit} disabled={!ids.length || save.isPending}>
          {save.isPending ? "Сохраняем…" : "Сохранить план"}
        </Button>
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onDone} disabled={save.isPending}>
          Отмена
        </Button>
      </div>
      {!ids.length ? <p className="text-sm text-muted-foreground">Добавьте хотя бы один чай, чтобы сохранить план.</p> : null}
    </div>
  );
}

function ThursdayCard({
  thursday,
  mode,
  defaultPercent,
  marker,
}: {
  thursday: Thursday;
  mode: string;
  defaultPercent: number;
  marker: "Сегодня" | "Ближайший" | null;
}) {
  const headingId = useId();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const runningNow = marker === "Сегодня";

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border bg-card p-4",
        !thursday.planned && !editing && "border-dashed",
        marker && "border-[#8E3236]/40 ring-1 ring-[#8E3236]/15",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          Четверг, {thursday.label}
        </h2>
        <span className="flex flex-wrap gap-1.5">
          {marker ? <StatusBadge tone="brand">{marker}</StatusBadge> : null}
          {thursday.planned ? <StatusBadge tone="success">Запланировано</StatusBadge> : null}
        </span>
      </div>

      {editing ? (
        <ThursdayEditor thursday={thursday} defaultPercent={defaultPercent} onDone={() => setEditing(false)} />
      ) : thursday.planned ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
            <span className="font-semibold text-red-700">−{thursday.percent}%</span>
            <span className="text-muted-foreground">{thursday.custom_percent !== null ? "своя скидка" : "общая скидка"}</span>
            <span className="text-muted-foreground">·</span>
            <span>{thursdayPeriodText(thursday.date, mode)}</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {thursday.products.map((p) => (
              <span key={p.id} className="flex min-h-10 items-center gap-2.5">
                <ProductThumb product={p} />
                <span className="min-w-0 break-words">{p.name}</span>
              </span>
            ))}
          </div>
          {thursday.note ? <p className="text-sm text-muted-foreground">Заметка: {thursday.note}</p> : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <ConfirmAction
              trigger="Снять план"
              variant="ghost"
              title={`Снять план на ${thursday.label}?`}
              description={
                runningNow
                  ? "Скидка чая недели, которая идёт сейчас, сразу закончится, и в этот четверг акции не будет. Товары и их обычные цены не изменятся."
                  : "В этот четверг акции не будет — скидка на выбранный чай не включится. Товары и их обычные цены не изменятся."
              }
              confirm="Да, снять план"
              cancel="Оставить"
              onConfirm={async () => {
                await promotionsApi.clearThursday(thursday.date);
                refresh();
                toast.success(`План на ${thursday.label} снят`);
              }}
            />
          </div>
        </>
      ) : (
        <>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[15px] text-amber-900">Не запланировано — в этот четверг акции не будет</p>
          <div className="mt-auto pt-1">
            <Button type="button" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
              Запланировать
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function CalendarView({ calendar }: { calendar: Calendar }) {
  const { isOwner } = useAdmin();
  const today = moscowToday();
  const nothingPlanned = !calendar.upcoming.some((t) => t.planned);
  return (
    <>
      <div className="mb-4 flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 text-[15px]">
        <p>
          {THURSDAY_MODE_TEXT[calendar.mode] ?? ""} Общая скидка — {calendar.default_percent}%, у отдельного четверга можно задать свою.
        </p>
        {isOwner ? (
          <Link
            href="/admin/settings/thursday"
            className="inline-flex min-h-11 items-center gap-2 self-start text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Settings className="size-4" aria-hidden="true" />
            Настройки чая недели: скидка и срок
          </Link>
        ) : null}
      </div>
      {nothingPlanned ? (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
          Впереди не запланировано ни одного четверга — скидки на чай недели не будет. В понедельник бот напомнит об этом в Telegram.
        </p>
      ) : null}
      <ol aria-label="Ближайшие четверги" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {calendar.upcoming.map((t, i) => (
          <li key={t.date} className="min-w-0">
            <ThursdayCard
              thursday={t}
              mode={calendar.mode}
              defaultPercent={calendar.default_percent}
              marker={i === 0 ? (t.date === today ? "Сегодня" : "Ближайший") : null}
            />
          </li>
        ))}
      </ol>
    </>
  );
}

function CalendarScreen() {
  const query = useQuery({ queryKey: promotionKeys.thursdays, queryFn: () => promotionsApi.thursdays() });
  return (
    <>
      <PageHeader
        back={{ href: "/admin/promotions", label: "Акции" }}
        title="Чай недели"
        description="Отметьте заранее, на какой чай будет скидка в ближайшие четверги. Скидка включится и выключится сама."
      />
      <QueryState query={query} skeleton={4}>
        {(calendar) => <CalendarView calendar={calendar} />}
      </QueryState>
    </>
  );
}

/** Календарь ближайших 8 четвергов (/admin/promotions/thursdays). */
export function ThursdayCalendar() {
  const { can } = useAdmin();
  if (!can("promotions")) return <NoAccess section="Акции" />;
  return <CalendarScreen />;
}
