"use client";

/** Секции формы товара — общие для мастера (шаги) и карточки товара (секции). */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import { describedBy, Field } from "@/components/admin/Field";
import { Hint } from "@/components/admin/Hint";
import { MoneyField } from "@/components/admin/MoneyField";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { useAdmin } from "@/components/admin/session";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTRIBUTE_LABELS,
  BREW_METHOD_LABELS,
  BREW_METHODS,
  DEFAULT_WEIGHT_PRESETS,
  EFFECT_LABELS,
  emptyBrewMethod,
  formPricePerGram,
  packPriceKop,
  pricePerGramFromInput,
  productKeys,
  productsApi,
  SHAPE_LABELS,
  type BrewMethod,
  type BrewMethodForm,
  type ProductForm,
  type TeaEffect,
  type TeaShape,
} from "@/lib/admin/products";
import { formatGrams, formatRub } from "@/lib/format";

import { ChipsInput, NativeSelect, NumberField } from "./inputs";
import { NameField, PriceBasePicker } from "./shared";

export interface FormProps {
  form: ProductForm;
  update: (changes: Partial<ProductForm>) => void;
  errors: Record<string, string>;
}

function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  description,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  description?: ReactNode;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint} error={error} description={description}>
      <Input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, description)}
      />
    </Field>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-1.5" />
    </div>
  );
}

// ------------------------------------------------------------------ шаг 2: название и описание

export function DescriptionFields({ form, update, errors }: FormProps) {
  const shortId = useId();
  const shortDescription = `${form.short_description.length} из 600 знаков`;
  return (
    <div className="flex flex-col gap-5">
      <NameField value={form.name} onChange={(name) => update({ name })} error={errors.name} />
      <Field
        id={shortId}
        label="Коротко о товаре"
        hint="1–2 предложения — их видно в каталоге и вверху страницы товара. Например: «Тёмный утёсный улун с нотами шоколада и сухофруктов»."
        error={errors.short_description}
        description={shortDescription}
      >
        <Textarea
          id={shortId}
          rows={3}
          maxLength={600}
          value={form.short_description}
          onChange={(e) => update({ short_description: e.target.value })}
          aria-describedby={describedBy(shortId, errors.short_description, shortDescription)}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <RichTextEditor
          label="Подробное описание"
          value={form.description}
          onChange={(doc) => update({ description: doc })}
          hint="История, вкус, аромат, советы — всё, что хочется рассказать покупателю. Можно добавлять заголовки, списки, фото и карточки других товаров."
        />
        {errors.description ? <p className="text-sm text-destructive">{errors.description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Иероглифы"
          value={form.hanzi}
          onChange={(hanzi) => update({ hanzi })}
          maxLength={8}
          hint="Название по-китайски — крупно на плитке товара, например 大红袍. Необязательно."
          error={errors.hanzi}
        />
        <TextField
          label="Пиньинь"
          value={form.pinyin}
          onChange={(pinyin) => update({ pinyin })}
          maxLength={80}
          hint="Название латиницей под иероглифами, например Da Hong Pao. Необязательно."
          error={errors.pinyin}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ шаг 4: цена и граммовки

function usePresets(selected: number[]): number[] {
  const { isOwner } = useAdmin();
  // общий список граммовок — в настройках, их видит только владелец; сотруднику — список по умолчанию
  const settings = useQuery({ queryKey: productKeys.presets, queryFn: productsApi.weightPresets, enabled: isOwner, staleTime: 300_000 });
  const allowed = settings.data ?? DEFAULT_WEIGHT_PRESETS;
  return [...new Set([...allowed, ...selected])].sort((a, b) => a - b);
}

function StockNote({ productId, isTea }: { productId: string; isTea: boolean }) {
  return (
    <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">
      {isTea ? "Остаток чая считается в граммах" : "Сколько штук в наличии"} и меняется только на складе — поставкой, списанием или
      инвентаризацией. Так история движения всегда точная.{" "}
      <Link href={`/admin/inventory?product=${productId}`} className="font-medium underline underline-offset-2">
        Открыть «Склад»
      </Link>
    </p>
  );
}

export function TeaPriceFields({ form, update, errors, productId }: FormProps & { productId: string }) {
  const { isOwner } = useAdmin();
  const presets = usePresets(form.weight_presets);
  const presetsLabelId = useId();
  const ppg = formPricePerGram(form);
  const nothingToBuy = !form.weight_presets.length && !form.cake_enabled && !form.custom_weight_enabled;

  function togglePreset(grams: number, on: boolean) {
    const next = on ? [...form.weight_presets, grams] : form.weight_presets.filter((g) => g !== grams);
    update({ weight_presets: [...new Set(next)].sort((a, b) => a - b) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PriceBasePicker
          value={form.price_base}
          onChange={(base) =>
            update({
              price_base: base,
              // та же цена за грамм, просто в другой «единице»
              price_kop: form.price_kop ? pricePerGramFromInput(form.price_kop, form.price_base) * base : null,
            })
          }
        />
        <MoneyField
          label={`Цена за ${form.price_base} г`}
          value={form.price_kop}
          onChange={(price_kop) => update({ price_kop })}
          error={errors.price}
          className="max-w-xs"
          hint={`Сколько стоят ${form.price_base} г этого чая. Цену любой фасовки посчитаем сами и округлим до рубля. Например, 600 ₽ за 50 г — это 12 ₽ за грамм.`}
          description={ppg ? `Получается ${formatRub(ppg)} за 1 г` : "Цену каждой фасовки посчитаем сами и округлим до рубля"}
        />
      </div>

      <div role="group" aria-labelledby={presetsLabelId} className="flex flex-col gap-2">
        <div className="flex min-h-7 items-center gap-1">
          <span id={presetsLabelId} className="text-[15px] font-medium">
            Граммовки
          </span>
          <Hint label="Граммовки">
            Какие фасовки показать покупателю, например 25, 50, 100 г. Отметьте нужные — цену каждой посчитаем сами.
          </Hint>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {presets.map((grams) => {
            const text = `${formatGrams(grams)}${ppg ? ` — ${formatRub(packPriceKop(grams, ppg))}` : ""}`;
            return (
              <Label key={grams} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 font-normal tabular-nums">
                <Checkbox
                  checked={form.weight_presets.includes(grams)}
                  onCheckedChange={(v) => togglePreset(grams, v === true)}
                  aria-label={text}
                />
                {text}
              </Label>
            );
          })}
        </div>
        {errors.weight_presets ? <p className="text-sm text-destructive">{errors.weight_presets}</p> : null}
        {isOwner ? (
          <p className="text-sm text-muted-foreground">
            Нужна другая граммовка? Добавьте её в{" "}
            <Link href="/admin/settings" className="underline underline-offset-2">
              «Настройки → Каталог»
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <SwitchRow
          label="Продаётся целым блином"
          description="Покупатель сможет взять весь блин (кирпич, точу) одной кнопкой."
          checked={form.cake_enabled}
          onChange={(cake_enabled) => update({ cake_enabled, cake_weight_grams: cake_enabled ? (form.cake_weight_grams ?? 357) : form.cake_weight_grams })}
        />
        {form.cake_enabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Вес блина, г"
              value={form.cake_weight_grams}
              onChange={(cake_weight_grams) => update({ cake_weight_grams })}
              suffix="г"
              hint="Например 357 г — обычный блин пуэра, 100 г — точа."
              error={errors.cake_weight_grams}
            />
            <MoneyField
              label="Цена за весь блин"
              value={form.cake_price_kop}
              onChange={(cake_price_kop) => update({ cake_price_kop })}
              error={errors.cake_price_kop}
              hint="Необязательно. Если оставить пустым — посчитаем по цене за грамм. Укажите, если целый блин продаёте дешевле."
              description={
                ppg && form.cake_weight_grams
                  ? `По цене за грамм: ${formatRub(packPriceKop(form.cake_weight_grams, ppg))}`
                  : "Пусто — по цене за грамм"
              }
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <SwitchRow
          label="Покупатель может ввести свой вес"
          description="Поле «Свой вес» на странице товара — для тех, кому нужно, например, 75 г."
          checked={form.custom_weight_enabled}
          onChange={(custom_weight_enabled) => update({ custom_weight_enabled })}
        />
        {form.custom_weight_enabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Минимум, г"
              value={form.custom_weight_min}
              onChange={(custom_weight_min) => update({ custom_weight_min })}
              suffix="г"
              hint="Меньше этого веса купить нельзя, например 10 г."
              error={errors.custom_weight_min}
            />
            <NumberField
              label="Шаг, г"
              value={form.custom_weight_step}
              onChange={(custom_weight_step) => update({ custom_weight_step })}
              suffix="г"
              hint="Вес вводится кратно шагу: при шаге 5 г можно купить 15, 20, 25 г."
              error={errors.custom_weight_step}
            />
          </div>
        ) : null}
      </div>

      {nothingToBuy ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Отметьте хотя бы одну граммовку, целый блин или свой вес — иначе чай будет не купить.
        </p>
      ) : null}
      <StockNote productId={productId} isTea />
    </div>
  );
}

export function UnitPriceFields({ form, update, errors, productId }: FormProps & { productId: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Цена за штуку"
          value={form.unit_price_kop}
          onChange={(unit_price_kop) => update({ unit_price_kop })}
          error={errors.unit_price_kop}
          hint="Например 2 500 ₽ за гайвань. Для набора — цена всего набора."
        />
        <NumberField
          label="Вес с упаковкой, г"
          value={form.weight_grams}
          onChange={(weight_grams) => update({ weight_grams })}
          suffix="г"
          hint="Нужен, чтобы посчитать доставку, например 350 г для гайвани в коробке. Необязательно."
          error={errors.weight_grams}
        />
      </div>
      <StockNote productId={productId} isTea={false} />
    </div>
  );
}

// ------------------------------------------------------------------ шаг 5: характеристики, вкус, заварка

function useTagSuggestions(q: string): string[] {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const tags = useQuery({ queryKey: productKeys.tags(debounced), queryFn: () => productsApi.tags(debounced), staleTime: 60_000 });
  return (tags.data ?? []).map((t) => t.name);
}

export function FlavorTagsField({ form, update }: Pick<FormProps, "form" | "update">) {
  const [q, setQ] = useState("");
  const suggestions = useTagSuggestions(q);
  return (
    <ChipsInput
      label="Вкусовые ноты"
      value={form.flavor_tags}
      onChange={(flavor_tags) => update({ flavor_tags })}
      suggestions={suggestions}
      onQuery={setQ}
      placeholder="Например: шоколад"
      hint="По ним работают фильтр «Вкус» на сайте и подбор похожих чаёв. Например: шоколад, чернослив, мёд."
    />
  );
}

export function SearchAliasesField({ form, update }: Pick<FormProps, "form" | "update">) {
  return (
    <ChipsInput
      label="Другие названия для поиска"
      value={form.search_aliases}
      onChange={(search_aliases) => update({ search_aliases })}
      max={30}
      placeholder="Например: шу"
      hint="Как ещё могут искать этот товар — с ошибками и сокращениями. Например, для шу пуэра: шу, шуй, шупуэр."
    />
  );
}

export function CharacteristicsFields({ form, update, errors }: FormProps) {
  const shapeId = useId();
  const effectId = useId();
  const a = form.attributes;
  const set = (changes: Partial<ProductForm["attributes"]>) => update({ attributes: { ...a, ...changes } });
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">Всё необязательно: пустые поля на сайте просто не покажутся.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={ATTRIBUTE_LABELS.tea_type} value={a.tea_type} onChange={(tea_type) => set({ tea_type })} maxLength={80} hint="Например: улун, шу пуэр, красный." />
        <TextField label={ATTRIBUTE_LABELS.region} value={a.region} onChange={(region) => set({ region })} maxLength={120} hint="Где вырос чай, например: Уишань, Фуцзянь." />
        <TextField label={ATTRIBUTE_LABELS.factory} value={a.factory} onChange={(factory) => set({ factory })} maxLength={120} hint="Например: Менхай или имя мастера." />
        <TextField
          label={ATTRIBUTE_LABELS.fermentation}
          value={a.fermentation}
          onChange={(fermentation) => set({ fermentation })}
          maxLength={80}
          hint="Например: слабая, средняя (40%), сильная."
        />
        <NumberField
          label={ATTRIBUTE_LABELS.harvest_year}
          value={a.harvest_year}
          onChange={(harvest_year) => set({ harvest_year })}
          hint="Например 2023."
          error={errors["attributes.harvest_year"]}
        />
        <NumberField
          label={ATTRIBUTE_LABELS.pressing_year}
          value={a.pressing_year}
          onChange={(pressing_year) => set({ pressing_year })}
          hint="Для прессованных чаёв, например 2019."
          error={errors["attributes.pressing_year"]}
        />
        <Field id={shapeId} label={ATTRIBUTE_LABELS.shape} hint="Как выглядит чай: блин, кирпич, рассыпной, точа (маленькое «гнёздышко»).">
          <NativeSelect id={shapeId} value={a.shape} onChange={(e) => set({ shape: e.target.value as TeaShape | "" })}>
            <option value="">Не указана</option>
            {(Object.keys(SHAPE_LABELS) as TeaShape[]).map((shape) => (
              <option key={shape} value={shape}>
                {SHAPE_LABELS[shape]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id={effectId} label={ATTRIBUTE_LABELS.effect} hint="Как чай действует — по этому покупатели фильтруют каталог. Например, шэн пуэр обычно бодрит.">
          <NativeSelect id={effectId} value={a.effect} onChange={(e) => set({ effect: e.target.value as TeaEffect | "" })}>
            <option value="">Не указан</option>
            {(Object.keys(EFFECT_LABELS) as TeaEffect[]).map((effect) => (
              <option key={effect} value={effect}>
                {EFFECT_LABELS[effect]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <FlavorTagsField form={form} update={update} />
    </div>
  );
}

function BrewMethodBlock({
  method,
  value,
  index,
  errors,
  onToggle,
  onChange,
}: {
  method: BrewMethod;
  value: BrewMethodForm | null;
  index: number;
  errors: Record<string, string>;
  onToggle: (on: boolean) => void;
  onChange: (changes: Partial<BrewMethodForm>) => void;
}) {
  const labelId = useId();
  const err = (key: string) => errors[`brewing.methods.${index}.${key}`];
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-3 rounded-xl border p-3 md:p-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox checked={value !== null} onCheckedChange={(v) => onToggle(v === true)} aria-labelledby={labelId} />
        <span id={labelId} className="text-[15px] font-medium">
          {BREW_METHOD_LABELS[method]}
        </span>
      </label>
      {value ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Посуда" value={value.vessel} onChange={(vessel) => onChange({ vessel })} maxLength={80} hint="Например: гайвань 120 мл или чайник." />
          <NumberField label="Чай, г" value={value.grams} onChange={(grams) => onChange({ grams })} decimal suffix="г" hint="Сколько граммов на этот объём воды, например 7." error={err("grams")} />
          <NumberField label="Вода, мл" value={value.volume_ml} onChange={(volume_ml) => onChange({ volume_ml })} suffix="мл" hint="Объём воды или посуды, например 120." error={err("volume_ml")} />
          <NumberField label="Температура воды, °C" value={value.temp_c} onChange={(temp_c) => onChange({ temp_c })} hint="Например 95 — почти кипяток, 80 — для зелёного чая." error={err("temp_c")} />
          <NumberField
            label="Первый пролив, сек"
            value={value.first_steep_sec}
            onChange={(first_steep_sec) => onChange({ first_steep_sec })}
            hint="Например 10. Для термоса и холодного заваривания — тоже в секундах: 1 час = 3600."
          />
          <NumberField
            label="Следующие проливы, сек"
            value={value.next_steep_sec}
            onChange={(next_steep_sec) => onChange({ next_steep_sec })}
            hint="Например 15 — и с каждым проливом чуть дольше."
          />
          <NumberField label="Сколько проливов" value={value.steeps} onChange={(steeps) => onChange({ steeps })} hint="Например 8." error={err("steeps")} />
          <TextField label="Заметка" value={value.note} onChange={(note) => onChange({ note })} maxLength={300} hint="Например: первый пролив слить." />
        </div>
      ) : null}
    </div>
  );
}

export function BrewingFields({ form, update, errors }: FormProps) {
  const noteId = useId();
  const byMethod = new Map(form.brewing_methods.map((m, i) => [m.method, { m, i }]));

  function toggle(method: BrewMethod, on: boolean) {
    const list = on
      ? BREW_METHODS.flatMap((x) => (x === method ? [emptyBrewMethod(x)] : byMethod.has(x) ? [byMethod.get(x)!.m] : []))
      : form.brewing_methods.filter((m) => m.method !== method);
    update({ brewing_methods: list });
  }

  function change(method: BrewMethod, changes: Partial<BrewMethodForm>) {
    update({ brewing_methods: form.brewing_methods.map((m) => (m.method === method ? { ...m, ...changes } : m)) });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Отметьте способы, которыми можно заваривать этот чай, и заполните, что знаете — пустые поля на сайте не покажутся.
      </p>
      {BREW_METHODS.map((method) => {
        const entry = byMethod.get(method);
        return (
          <BrewMethodBlock
            key={method}
            method={method}
            value={entry?.m ?? null}
            index={entry?.i ?? -1}
            errors={errors}
            onToggle={(on) => toggle(method, on)}
            onChange={(changes) => change(method, changes)}
          />
        );
      })}
      <Field
        id={noteId}
        label="Комментарий мастера"
        hint="Свободный совет от вас, например: «Не бойтесь долгих проливов — этот чай не горчит»."
        className="mt-2"
      >
        <Textarea id={noteId} rows={3} maxLength={3000} value={form.master_note} onChange={(e) => update({ master_note: e.target.value })} />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ адрес и поисковики

export function SlugField({ form, update, errors }: FormProps) {
  const slug = form.slug.trim().toLowerCase();
  return (
    <TextField
      label="Адрес страницы"
      value={form.slug}
      onChange={(value) => update({ slug: value })}
      maxLength={80}
      error={errors.slug}
      description={slug ? `Полный адрес: nsbtea.ru/product/${slug}` : undefined}
      hint="Латиница, цифры и дефисы, например da-hun-pao. Если товар уже на сайте, старый адрес будет сам перенаправлять на новый."
    />
  );
}

export function SeoFields({ form, update, errors }: FormProps) {
  const descId = useId();
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Заголовок для поисковиков"
        value={form.seo_title}
        onChange={(seo_title) => update({ seo_title })}
        maxLength={200}
        error={errors.seo_title}
        hint="Необязательно. Если пусто — возьмём название. Например: «Да Хун Пао — купить утёсный улун»."
      />
      <Field
        id={descId}
        label="Описание для поисковиков"
        error={errors.seo_description}
        hint="Необязательно. 1–2 предложения под ссылкой в Яндексе и Google. Если пусто — возьмём короткое описание."
      >
        <Textarea id={descId} rows={2} maxLength={400} value={form.seo_description} onChange={(e) => update({ seo_description: e.target.value })} />
      </Field>
    </div>
  );
}
