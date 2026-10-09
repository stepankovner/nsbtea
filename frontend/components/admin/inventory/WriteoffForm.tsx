"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Field } from "@/components/admin/Field";
import { Hint } from "@/components/admin/Hint";
import { PageHeader } from "@/components/admin/page";
import { ProductPicker } from "@/components/admin/ProductPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { checkQty, inventoryApi, isTea, parseIds, WRITEOFF_REASONS, type QtyCheck, type WriteoffReason } from "@/lib/admin/inventory";
import { formatQty, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

import { qtyFieldId, QtyField, StepHeader, StickyBar, useAfterStockChange } from "./parts";
import { SelectedFields } from "./SelectedFields";
import { useSelectedStock } from "./useStockInfo";

type Step = 1 | 2;

/** «Списание» — брак, дегустация, личное, другое; с подтверждением и объяснением последствий (SPEC 10.4). */
export function WriteoffForm() {
  const params = useSearchParams();
  const reasonLabelId = useId();
  const commentId = useId();
  const [initial] = useState(() => parseIds(params.get("products")));
  const [ids, setIds] = useState<string[]>(initial);
  const [step, setStep] = useState<Step>(initial.length ? 2 : 1);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<WriteoffReason | null>(null);
  const [comment, setComment] = useState("");
  const [pickError, setPickError] = useState(false);
  // после успешного списания — не даём списать второй раз, пока открывается история
  const [finished, setFinished] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const stock = useSelectedStock(ids);
  const done = useAfterStockChange();

  useEffect(() => {
    if (!moved.current) return;
    const field = step === 2 && ids[0] ? document.getElementById(qtyFieldId(ids[0])) : null;
    (field ?? headingRef.current)?.focus();
    // нужен только переход между шагами
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function go(next: Step) {
    moved.current = true;
    setStep(next);
  }

  const checks: Record<string, QtyCheck> = {};
  for (const id of ids) {
    const info = stock.info[id];
    checks[id] = info ? checkQty(texts[id] ?? "", info.type, "writeoff", info.stock) : { value: null, error: "Загружаем товар…" };
  }
  const lines = ids.flatMap((id) => {
    const info = stock.info[id];
    const value = checks[id]?.value;
    if (!info || value === null || value === undefined) return [];
    return [{ id, name: info.name, type: info.type, before: info.stock, value, after: info.stock - value }];
  });

  const anyEmpty = ids.some((id) => !(texts[id] ?? "").trim());
  const anyInvalid = ids.some((id) => (texts[id] ?? "").trim() && checks[id]?.error);
  const valid = ids.length > 0 && lines.length === ids.length && reason !== null;
  const blocker = !ids.length
    ? "Добавьте хотя бы один товар"
    : anyInvalid
      ? "Исправьте числа, отмеченные красным"
      : anyEmpty
        ? "Укажите, сколько списать, у каждого товара"
        : reason === null
          ? "Выберите причину списания"
          : null;
  const reasonInfo = WRITEOFF_REASONS.find((r) => r.value === reason);

  function shownError(id: string): string | null {
    const error = checks[id]?.error ?? null;
    if (!error || !stock.info[id]) return null;
    return (texts[id] ?? "").trim() ? error : null;
  }

  async function confirm() {
    if (!reason) return;
    await inventoryApi.writeOff({
      reason,
      comment: comment.trim() || null,
      lines: lines.map((l) => ({ product_id: l.id, qty: l.value })),
    });
    setFinished(true);
    done(`Списано: ${lines.length} ${plural(lines.length, "товар", "товара", "товаров")}, остатки обновлены`);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <PageHeader
        back={{ href: "/admin/inventory", label: "Склад" }}
        title="Списание"
        description="Если чай испортился, ушёл на дегустацию или вы взяли его себе — спишите его, чтобы остаток на сайте был верным."
      />

      {step === 1 ? (
        <section aria-label="Что списываем">
          <StepHeader step={1} total={2} title="Что списываем" headingRef={headingRef} />
          <ProductPicker
            label="Товары"
            hint="Найдите товар по названию. Можно сразу несколько, если причина у них одна — например, всё, что заварили на дегустации."
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
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => (ids.length ? go(2) : setPickError(true))}
            >
              Дальше: сколько и почему
            </Button>
          </StickyBar>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-label="Сколько и почему">
          <StepHeader
            step={2}
            total={2}
            title="Сколько и почему"
            hint="Для чая — целые граммы (например, 50), для посуды и наборов — целые штуки. Списать больше, чем есть на складе, нельзя."
            headingRef={headingRef}
          />
          <SelectedFields ids={ids} stock={stock} onRemove={(id) => setIds(ids.filter((v) => v !== id))}>
            {(info) => {
              const value = checks[info.id]?.value ?? null;
              return (
                <QtyField
                  id={qtyFieldId(info.id)}
                  label={info.name}
                  type={info.type}
                  value={texts[info.id] ?? ""}
                  onChange={(text) => setTexts((t) => ({ ...t, [info.id]: text }))}
                  hint={
                    isTea(info.type)
                      ? "Сколько граммов списать — целым числом, без дробей. Например, 50."
                      : "Сколько штук списать — целым числом. Например, 1."
                  }
                  description={
                    value !== null
                      ? `На складе ${formatQty(info.type, info.stock)} → останется ${formatQty(info.type, info.stock - value)}`
                      : `На складе: ${formatQty(info.type, info.stock)}`
                  }
                  error={shownError(info.id)}
                />
              );
            }}
          </SelectedFields>

          <div className="mt-5 flex flex-col gap-2">
            <div className="flex min-h-7 items-center gap-1">
              <span id={reasonLabelId} className="text-[15px] font-medium">
                Причина
              </span>
              <Hint label="Причина">Причина попадёт в историю движения — так потом будет понятно, куда ушёл товар.</Hint>
            </div>
            <RadioGroup
              aria-labelledby={reasonLabelId}
              value={reason ?? ""}
              onValueChange={(v) => setReason(v as WriteoffReason)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {WRITEOFF_REASONS.map((r) => (
                <Label
                  key={r.value}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 font-normal",
                    reason === r.value && "border-primary ring-1 ring-primary",
                  )}
                >
                  <RadioGroupItem value={r.value} aria-label={r.label} aria-describedby={`${reasonLabelId}-${r.value}`} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-medium">{r.label}</span>
                    <span id={`${reasonLabelId}-${r.value}`} className="text-sm leading-snug text-muted-foreground">
                      {r.example}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Field
            id={commentId}
            label="Комментарий"
            hint="Необязательно, но помогает вспомнить. Например: «пачка отсырела» или «дегустация в субботу»."
            className="mt-5"
          >
            <Textarea
              id={commentId}
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
              placeholder={reason === "other" ? "Что случилось?" : "Например, пачка отсырела"}
              className="min-h-20"
            />
          </Field>

          <StickyBar>
            <Button type="button" variant="outline" size="lg" className="self-start" onClick={() => go(1)}>
              Назад
            </Button>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none sm:flex-row-reverse sm:items-center sm:gap-3 [&>button]:w-full sm:[&>button]:w-auto">
              <ConfirmAction
                trigger="Списать"
                title="Списать со склада?"
                variant="destructive"
                size="lg"
                disabled={!valid || finished}
                confirm="Да, списать"
                cancel="Не списывать"
                onConfirm={confirm}
                description={
                  <div className="flex flex-col gap-3">
                    <ul aria-label="Что изменится" className="flex flex-col gap-1 text-foreground">
                      {lines.map((l) => (
                        <li key={l.id}>
                          {l.name}: {formatQty(l.type, l.before)} → {formatQty(l.type, l.after)}
                        </li>
                      ))}
                    </ul>
                    <p>
                      Причина: {reasonInfo?.label ?? "—"}
                      {comment.trim() ? ` — ${comment.trim()}` : ""}
                    </p>
                    <p>
                      Остаток уменьшится сразу. Если он дойдёт до порога, товар попадёт в «Нужно дозаказать», а при нуле на сайте
                      появится «Нет в наличии».
                    </p>
                    <p>Отменить списание кнопкой нельзя. Если ошиблись — поправьте остаток через «Инвентаризацию».</p>
                  </div>
                }
              />
              {blocker ? <p className="text-center text-sm text-muted-foreground sm:text-right">{blocker}</p> : null}
            </div>
          </StickyBar>
        </section>
      ) : null}
    </div>
  );
}
