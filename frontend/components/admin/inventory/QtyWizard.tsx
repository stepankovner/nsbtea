"use client";

import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Field } from "@/components/admin/Field";
import { PageHeader } from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { checkQty, parseIds, signedQty, type QtyCheck } from "@/lib/admin/inventory";
import { errorMessage } from "@/lib/api/errors";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

import { qtyFieldId, QtyField, StepHeader, StickyBar, useAfterStockChange } from "./parts";
import { useStockInfo, type StockInfo } from "./useStockInfo";

export interface WizardLine {
  id: string;
  name: string;
  type: string;
  before: number;
  value: number;
  after: number;
}

/** Тексты и действие конкретного сценария (поставка или инвентаризация). */
export interface WizardConfig {
  title: string;
  description: string;
  rule: "supply" | "count";
  pick: { title: string; label: string; hint: ReactNode };
  amounts: {
    title: string;
    hint: ReactNode;
    fieldHint: (type: string) => ReactNode;
    /** пояснение под полем: что сейчас на складе и что будет */
    describe: (info: StockInfo, check: QtyCheck) => string;
  };
  /** остаток после проведения */
  after: (before: number, value: number) => number;
  comment: { label: string; hint: ReactNode; placeholder: string };
  review: { title: string; note: (lines: WizardLine[]) => ReactNode; submit: string };
  /** провести на сервере; вернуть текст уведомления «готово» */
  onSubmit: (lines: WizardLine[], comment: string | null) => Promise<string>;
}

type Step = 1 | 2 | 3;

/** Три шага: какие товары → сколько → проверка «было → станет» и «Провести». */
export function QtyWizard({ config }: { config: WizardConfig }) {
  const params = useSearchParams();
  const commentId = useId();
  const [initial] = useState(() => parseIds(params.get("products")));
  const [ids, setIds] = useState<string[]>(initial);
  const [step, setStep] = useState<Step>(initial.length ? 2 : 1);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [pickError, setPickError] = useState(false);
  const [checked, setChecked] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const stock = useStockInfo(ids);
  const done = useAfterStockChange();

  // при переходе между шагами — фокус на первое поле или на заголовок шага (и прокрутка к нему)
  useEffect(() => {
    if (!moved.current) return;
    const field = step === 2 && ids[0] ? document.getElementById(qtyFieldId(ids[0])) : null;
    (field ?? headingRef.current)?.focus();
    // нужен только переход между шагами
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function go(next: Step) {
    moved.current = true;
    setServerError(null);
    setStep(next);
  }

  const checks: Record<string, QtyCheck> = {};
  for (const id of ids) {
    const info = stock.info[id];
    checks[id] = info ? checkQty(texts[id] ?? "", info.type, config.rule) : { value: null, error: "Загружаем товар…" };
  }

  const lines: WizardLine[] = ids.flatMap((id) => {
    const info = stock.info[id];
    const value = checks[id]?.value;
    if (!info || value === null || value === undefined) return [];
    return [{ id, name: info.name, type: info.type, before: info.stock, value, after: config.after(info.stock, value) }];
  });

  const submit = useMutation({
    mutationFn: () => config.onSubmit(lines, comment.trim() || null),
    onSuccess: (message) => done(message),
    onError: (e) => setServerError(errorMessage(e)),
  });

  function toAmounts() {
    if (!ids.length) {
      setPickError(true);
      return;
    }
    go(2);
  }

  function toReview(event?: FormEvent) {
    event?.preventDefault();
    setChecked(true);
    const invalid = ids.find((id) => checks[id]?.error);
    if (invalid) {
      document.getElementById(qtyFieldId(invalid))?.focus();
      return;
    }
    go(3);
  }

  function shownError(id: string): string | null {
    const error = checks[id]?.error ?? null;
    if (!error || !stock.info[id]) return null;
    return checked || (texts[id] ?? "").trim() ? error : null;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <PageHeader back={{ href: "/admin/inventory", label: "Склад" }} title={config.title} description={config.description} />

      {step === 1 ? (
        <section aria-label={config.pick.title}>
          <StepHeader step={1} total={3} title={config.pick.title} headingRef={headingRef} />
          <ProductPicker
            label={config.pick.label}
            hint={config.pick.hint}
            value={ids}
            onChange={(next) => {
              setIds(next);
              if (next.length) setPickError(false);
            }}
          />
          {pickError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Добавьте хотя бы один товар — нажмите «Добавить товар» и найдите его по названию.
            </p>
          ) : null}
          <StickyBar>
            <span className="hidden sm:block" />
            <Button type="button" size="lg" className="w-full sm:w-auto" onClick={toAmounts}>
              Дальше: {config.amounts.title.toLowerCase()}
            </Button>
          </StickyBar>
        </section>
      ) : null}

      {step === 2 ? (
        <form aria-label={config.amounts.title} noValidate onSubmit={toReview}>
          <StepHeader step={2} total={3} title={config.amounts.title} hint={config.amounts.hint} headingRef={headingRef} />
          {stock.loading ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем">
              {ids.map((id) => (
                <Skeleton key={id} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {ids.map((id) => {
                const info = stock.info[id];
                if (!info) {
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-[15px]">
                      <span>Товар не найден — возможно, его убрали в архив.</span>
                      <Button type="button" variant="outline" onClick={() => setIds(ids.filter((v) => v !== id))}>
                        Убрать
                      </Button>
                    </div>
                  );
                }
                return (
                  <div key={id} className="rounded-xl border bg-card p-4">
                    <QtyField
                      id={qtyFieldId(id)}
                      label={info.name}
                      type={info.type}
                      value={texts[id] ?? ""}
                      onChange={(value) => setTexts((t) => ({ ...t, [id]: value }))}
                      hint={config.amounts.fieldHint(info.type)}
                      description={config.amounts.describe(info, checks[id]!)}
                      error={shownError(id)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <Field id={commentId} label={config.comment.label} hint={config.comment.hint} className="mt-5">
            <Textarea
              id={commentId}
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
              placeholder={config.comment.placeholder}
              className="min-h-20"
            />
          </Field>

          {checked && ids.some((id) => shownError(id)) ? (
            <p className="mt-3 text-sm text-destructive">Проверьте числа, отмеченные красным.</p>
          ) : null}

          <StickyBar>
            <Button type="button" variant="outline" size="lg" onClick={() => go(1)}>
              Назад
            </Button>
            <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={stock.loading}>
              Дальше: проверить
            </Button>
          </StickyBar>
        </form>
      ) : null}

      {step === 3 ? (
        <section aria-label={config.review.title}>
          <StepHeader step={3} total={3} title={config.review.title} headingRef={headingRef} />
          <div className="rounded-xl border bg-card p-4 md:p-5">
            <ul aria-label="Что изменится" className="-my-1 flex flex-col">
              {lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 border-b py-3 last:border-b-0">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{line.name}</span>
                    <span className="text-[15px] text-muted-foreground tabular-nums">
                      {formatQty(line.type, line.before)} → {formatQty(line.type, line.after)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-lg font-semibold tabular-nums",
                      line.after > line.before ? "text-emerald-700" : line.after < line.before ? "text-red-700" : "text-muted-foreground",
                    )}
                  >
                    {signedQty(line.type, line.after - line.before)}
                  </span>
                </li>
              ))}
            </ul>
            {comment.trim() ? (
              <p className="mt-3 border-t pt-3 text-[15px]">
                {config.comment.label}: {comment.trim()}
              </p>
            ) : null}
          </div>
          <div className="mt-3 text-[15px] text-muted-foreground">{config.review.note(lines)}</div>

          {serverError ? (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-900">
              {serverError}
            </p>
          ) : null}

          <StickyBar>
            {/* после успеха кнопки остаются выключенными до перехода — чтобы не провести дважды */}
            <Button type="button" variant="outline" size="lg" disabled={submit.isPending || submit.isSuccess} onClick={() => go(2)}>
              Назад
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1 sm:flex-none"
              disabled={submit.isPending || submit.isSuccess || !lines.length}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Проводим…" : submit.isSuccess ? "Готово" : config.review.submit}
            </Button>
          </StickyBar>
        </section>
      ) : null}
    </div>
  );
}
