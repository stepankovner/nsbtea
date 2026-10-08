"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, QueryState, SectionCard } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import {
  isSettingsGroup,
  SETTINGS_GROUPS,
  settingsApi,
  settingsKeys,
  type AllSettings,
  type SettingsGroupKey,
  type SettingsMeta,
} from "@/lib/admin/settings";

import { SettingInput } from "./fields";
import { OwnerOnly } from "./OwnerOnly";
import { buildPayload, groupTitle, ownerField, sameValue, settingSections, type FormErrors, type FormValues } from "./schema";
import { useUnsavedChanges } from "./useUnsavedChanges";

const BACK = { href: "/admin/settings", label: "Все настройки" };

function GroupForm({ group, meta, initial }: { group: SettingsGroupKey; meta: SettingsMeta; initial: FormValues }) {
  const client = useQueryClient();
  const formId = useId();
  const sections = useMemo(() => settingSections(group, meta), [group, meta]);
  const keys = useMemo(() => sections.flatMap((s) => s.fields.map((f) => f.key)), [sections]);
  const [baseline, setBaseline] = useState<FormValues>(initial);
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  const { payload } = buildPayload(sections, values, baseline);
  const dirty = !sameValue(payload, baseline);
  useUnsavedChanges(dirty);

  const save = useMutation({
    mutationFn: (body: FormValues) => settingsApi.save(group, body as AllSettings[typeof group]),
    onSuccess: (saved) => {
      const next = saved as unknown as FormValues;
      setBaseline(next);
      setValues(next);
      setSavedOnce(true);
      client.setQueryData<AllSettings>(settingsKeys.values, (old) => (old ? { ...old, [group]: saved } : old));
      // чек-лист запуска на сводке зависит от реквизитов и контактов
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Настройки сохранены");
    },
    onError: (e) => {
      const byField = e instanceof ApiError ? fieldErrors(e) : {};
      setErrors(byField);
      const other = Object.entries(byField)
        .filter(([key]) => ownerField(key, keys) === null)
        .map(([, message]) => message)
        .filter((m) => m !== errorMessage(e));
      setFormError([errorMessage(e), ...other].join(". "));
    },
  });

  function change(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
    if (Object.keys(errors).some((k) => ownerField(k, [key]))) {
      setErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => !ownerField(k, [key]))));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const built = buildPayload(sections, values, baseline);
    if (Object.keys(built.errors).length) {
      setErrors(built.errors);
      setFormError("Исправьте поля, отмеченные красным");
      return;
    }
    setErrors({});
    setFormError(null);
    if (sameValue(built.payload, baseline)) {
      toast.info("Изменений нет — всё уже сохранено");
      return;
    }
    save.mutate(built.payload);
  }

  const status = dirty ? "Есть несохранённые изменения" : savedOnce ? "Все изменения сохранены" : "Изменений пока нет";

  return (
    <form id={formId} noValidate onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      {sections.map((section, i) => (
        <SectionCard key={section.title ?? i} title={section.title ?? undefined} id={`${formId}-section-${i}`}>
          <div className="flex flex-col gap-5">
            {section.description || section.link ? (
              <p className="-mt-1 text-[15px] text-muted-foreground">
                {section.description}{" "}
                {section.link ? (
                  <Link href={section.link.href} className="font-medium text-foreground underline underline-offset-2">
                    {section.link.label}
                  </Link>
                ) : null}
              </p>
            ) : null}
            {section.fields.map((field) => (
              <SettingInput key={field.key} field={field} value={values[field.key]} onChange={(v) => change(field.key, v)} errors={errors} />
            ))}
          </div>
        </SectionCard>
      ))}

      {formError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-900">
          {formError}
        </p>
      ) : null}

      {/* на телефоне кнопка всегда видна над нижней панелью меню. Не выключаем её без изменений:
          сумма в поле денег применяется при уходе из поля, и первое нажатие не должно теряться */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+68px)] z-20 flex flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {status}
        </p>
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={save.isPending}>
          {save.isPending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}

function GroupScreen({ group }: { group: SettingsGroupKey }) {
  const meta = useQuery({ queryKey: settingsKeys.meta, queryFn: settingsApi.meta, staleTime: 5 * 60_000 });
  const values = useQuery({ queryKey: settingsKeys.values, queryFn: settingsApi.all });
  const description = SETTINGS_GROUPS.find((g) => g.key === group)?.description;
  return (
    <QueryState query={meta}>
      {(m) => (
        <>
          <PageHeader back={BACK} title={groupTitle(group, m) ?? "Настройки"} description={description} />
          <QueryState query={values}>
            {(all) => <GroupForm key={group} group={group} meta={m} initial={all[group] as unknown as FormValues} />}
          </QueryState>
        </>
      )}
    </QueryState>
  );
}

export function SettingsGroupPage({ group }: { group: string }) {
  return (
    <OwnerOnly>
      {isSettingsGroup(group) ? (
        <GroupScreen group={group} />
      ) : (
        <>
          <PageHeader back={BACK} title="Настройки" />
          <EmptyState
            icon={SearchX}
            title="Такого раздела настроек нет"
            action={
              <Button asChild variant="outline">
                <Link href={BACK.href}>Все настройки</Link>
              </Button>
            }
          >
            Возможно, ссылка устарела. Выберите нужный раздел в списке настроек.
          </EmptyState>
        </>
      )}
    </OwnerOnly>
  );
}
