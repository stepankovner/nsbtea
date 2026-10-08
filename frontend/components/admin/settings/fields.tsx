"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import { describedBy, Field } from "@/components/admin/Field";
import { Hint } from "@/components/admin/Hint";
import { MoneyField } from "@/components/admin/MoneyField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { newBoxCode, type FormErrors, type SettingField } from "./schema";

interface FieldProps {
  field: SettingField;
  value: unknown;
  onChange: (value: unknown) => void;
  errors: FormErrors;
}

/** Одно поле настроек нужного типа: деньги, число, переключатель, выбор, текст, список, коробки. */
export function SettingInput(props: FieldProps) {
  switch (props.field.kind) {
    case "money":
      return <MoneyInput {...props} />;
    case "number":
      return <NumberInput {...props} />;
    case "boolean":
      return <BooleanInput {...props} />;
    case "choice":
      return <ChoiceInput {...props} />;
    case "numberList":
      return <NumberListInput {...props} />;
    case "boxes":
      return <BoxesInput {...props} />;
    default:
      return <TextInput {...props} />;
  }
}

function MoneyInput({ field, value, onChange, errors }: FieldProps) {
  return (
    <MoneyField
      label={field.label}
      value={typeof value === "number" ? value : null}
      onChange={onChange}
      hint={field.hint}
      description={field.description}
      error={errors[field.key]}
      className="sm:max-w-xs"
    />
  );
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function NumberBox({
  id,
  value,
  onChange,
  unit,
  error,
  description,
}: {
  id: string;
  value: unknown;
  onChange: (text: string) => void;
  unit?: string;
  error?: string | null;
  description?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={asText(value)}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, description)}
        className={cn("tabular-nums", unit && "pr-12")}
      />
      {unit ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

function NumberInput({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  const error = errors[field.key];
  return (
    <Field id={id} label={field.label} hint={field.hint} description={field.description} error={error} className="sm:max-w-xs">
      <NumberBox id={id} value={value} onChange={onChange} unit={field.unit} error={error} description={field.description} />
    </Field>
  );
}

function TextInput({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  const error = errors[field.key];
  const common = {
    id,
    value: asText(value),
    maxLength: field.maxLength,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, error, field.description),
  } as const;
  return (
    <Field id={id} label={field.label} hint={field.hint} description={field.description} error={error}>
      {field.kind === "textarea" ? (
        <Textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          {...common}
          inputMode={field.inputMode}
          type={field.inputMode === "email" ? "email" : field.inputMode === "tel" ? "tel" : "text"}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function BooleanInput({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  const error = errors[field.key];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-h-7 items-center gap-1">
          <Label htmlFor={id} className="text-[15px] font-medium">
            {field.label}
          </Label>
          {field.hint ? <Hint label={field.label}>{field.hint}</Hint> : null}
        </div>
        {error ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
          </p>
        ) : field.description ? (
          <p id={`${id}-description`} className="text-sm text-muted-foreground">
            {field.description}
          </p>
        ) : null}
      </div>
      {/* крупная зона нажатия вокруг маленького переключателя */}
      <div className="flex min-h-11 shrink-0 items-center px-1">
        <Switch
          id={id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-describedby={describedBy(id, error, field.description)}
          className="scale-125"
        />
      </div>
    </div>
  );
}

/** Подпись группы полей: legend — первым элементом (имя группы для экранного диктора), рядом «?». */
function FieldsetHeader({ id, label, hint }: { id: string; label: string; hint?: string }) {
  return (
    <>
      <legend id={id} className="sr-only">
        {label}
      </legend>
      <div className="flex min-h-7 items-center gap-1">
        <span aria-hidden="true" className="text-[15px] font-medium">
          {label}
        </span>
        {hint ? <Hint label={label}>{hint}</Hint> : null}
      </div>
    </>
  );
}

function ChoiceInput({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  const error = errors[field.key];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <FieldsetHeader id={`${id}-legend`} label={field.label} hint={field.hint} />
      {field.description ? <p className="text-sm text-muted-foreground">{field.description}</p> : null}
      <RadioGroup value={asText(value)} onValueChange={onChange} aria-labelledby={`${id}-legend`} className="mt-1 gap-2">
        {(field.options ?? []).map((option) => (
          <Label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 text-[15px] font-normal has-[[data-state=checked]]:border-foreground has-[[data-state=checked]]:bg-muted/60"
          >
            <RadioGroupItem value={option.value} aria-label={option.label} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

function NumberListInput({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  const list = Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
  const [text, setText] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const error = local ?? errors[field.key] ?? null;
  const unit = field.unit ? ` ${field.unit}` : "";

  function add() {
    const cleaned = text.replace(/\s/g, "");
    if (!/^\d+$/.test(cleaned) || Number(cleaned) <= 0) {
      setLocal(`Введите целое число больше нуля, например 150`);
      return;
    }
    const next = Number(cleaned);
    if (list.includes(next)) {
      setLocal(`Вариант ${next}${unit} уже есть`);
      return;
    }
    setLocal(null);
    setText("");
    onChange([...list, next].sort((a, b) => a - b));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <FieldsetHeader id={`${id}-legend`} label={field.label} hint={field.hint} />
      {field.description ? <p className="text-sm text-muted-foreground">{field.description}</p> : null}
      {list.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={field.label}>
          {list.map((n) => (
            <li key={n} className="flex h-11 items-center gap-1 rounded-full border bg-card pl-4 pr-1 text-[15px] tabular-nums">
              {n}
              {unit}
              <button
                type="button"
                aria-label={`Убрать ${n}${unit}`}
                onClick={() => onChange(list.filter((v) => v !== n))}
                className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Пока нет ни одного варианта.</p>
      )}
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <Label htmlFor={id} className="text-sm text-muted-foreground">
          {field.addLabel}
        </Label>
        <div className="flex gap-2">
          <Input
            id={id}
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setLocal(null);
            }}
            onKeyDown={onKeyDown}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!text.trim()}>
            <Plus aria-hidden="true" />
            Добавить
          </Button>
        </div>
        {error ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

type BoxValue = Record<string, unknown>;

const BOX_DIMENSIONS = [
  { key: "length_cm", label: "Длина, см" },
  { key: "width_cm", label: "Ширина, см" },
  { key: "height_cm", label: "Высота, см" },
] as const;

function BoxEditor({
  index,
  box,
  onChange,
  onRemove,
  canRemove,
  errors,
  prefix,
}: {
  index: number;
  box: BoxValue;
  onChange: (box: BoxValue) => void;
  onRemove: () => void;
  canRemove: boolean;
  errors: FormErrors;
  prefix: string;
}) {
  const id = useId();
  const err = (prop: string) => errors[`${prefix}.${index}.${prop}`] ?? null;
  const title = `Коробка ${index + 1}`;
  return (
    <div className="relative rounded-lg border bg-background p-3">
      <fieldset className="flex flex-col gap-3">
        <legend className="flex min-h-9 items-center font-medium">{title}</legend>
      <Field id={`${id}-name`} label="Название" hint="Для себя, чтобы отличать коробки. Например: Маленькая." error={err("name")}>
        <Input
          id={`${id}-name`}
          value={asText(box.name)}
          maxLength={60}
          onChange={(e) => onChange({ ...box, name: e.target.value })}
          aria-invalid={err("name") ? true : undefined}
          aria-describedby={describedBy(`${id}-name`, err("name"))}
        />
      </Field>
      <Field
        id={`${id}-weight`}
        label="Вес до, г"
        hint="Самая тяжёлая посылка, которая помещается в эту коробку, вместе с упаковкой. Например: 1000 — до 1 кг."
        error={err("max_weight_grams")}
        className="sm:max-w-xs"
      >
        <NumberBox id={`${id}-weight`} value={box.max_weight_grams} onChange={(t) => onChange({ ...box, max_weight_grams: t })} unit="г" error={err("max_weight_grams")} />
      </Field>
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {BOX_DIMENSIONS.map((d) => (
          <Field key={d.key} id={`${id}-${d.key}`} label={d.label} error={err(d.key)}>
            <NumberBox id={`${id}-${d.key}`} value={box[d.key]} onChange={(t) => onChange({ ...box, [d.key]: t })} error={err(d.key)} />
          </Field>
        ))}
      </div>
      </fieldset>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Убрать коробку ${index + 1}`}
        className="absolute top-2 right-2 text-muted-foreground"
      >
        <Trash2 aria-hidden="true" />
        Убрать
      </Button>
    </div>
  );
}

function BoxesInput({ field, value, onChange, errors }: FieldProps) {
  const id = useId();
  const boxes = Array.isArray(value) ? (value as BoxValue[]) : [];
  const own = errors[field.key];
  return (
    <fieldset className="flex flex-col gap-3">
      <FieldsetHeader id={`${id}-legend`} label={field.label} hint={field.hint} />
      {field.description ? <p className="-mt-2 text-sm text-muted-foreground">{field.description}</p> : null}
      {boxes.map((box, i) => (
        <BoxEditor
          key={String(box.code ?? i)}
          index={i}
          box={box}
          prefix={field.key}
          errors={errors}
          canRemove={boxes.length > 1}
          onChange={(next) => onChange(boxes.map((b, j) => (j === i ? next : b)))}
          onRemove={() => onChange(boxes.filter((_, j) => j !== i))}
        />
      ))}
      {own ? <p className="text-sm text-destructive">{own}</p> : null}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() =>
          onChange([...boxes, { code: newBoxCode(boxes), name: "", max_weight_grams: "", length_cm: "", width_cm: "", height_cm: "" }])
        }
      >
        <Plus aria-hidden="true" />
        Добавить коробку
      </Button>
    </fieldset>
  );
}
