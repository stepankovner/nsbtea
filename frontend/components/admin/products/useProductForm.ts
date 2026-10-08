"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AUTOSAVE_LABELS, useAutosave, type AutosaveStatus } from "@/lib/admin/autosave";
import {
  clientErrors,
  formFromProduct,
  productKeys,
  productPatch,
  productsApi,
  type AdminProduct,
  type ProductForm,
} from "@/lib/admin/products";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";

/** Отказ сохранять: в форме есть ошибки, которые видно до отправки. */
export class InvalidFormError extends Error {}

/**
 * Состояние формы товара и сохранение изменений (PATCH только изменённых полей).
 * Черновик сохраняется сам после паузы в наборе (SPEC 10.1); остальное — явной кнопкой.
 */
export function useProductForm(product: AdminProduct, { autosave, delay = 1500 }: { autosave: boolean; delay?: number }) {
  const client = useQueryClient();
  const [form, setForm] = useState<ProductForm>(() => formFromProduct(product));
  const [saved, setSaved] = useState<ProductForm>(form);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [everSaved, setEverSaved] = useState(false);

  const local = clientErrors(form);
  const valid = Object.keys(local).length === 0;
  const dirty = Object.keys(productPatch(form, saved)).length > 0;

  async function persist(next: ProductForm): Promise<AdminProduct | null> {
    if (Object.keys(clientErrors(next)).length) throw new InvalidFormError();
    const body = productPatch(next, saved);
    if (!Object.keys(body).length) return null;
    setSaving(true);
    try {
      const result = await productsApi.patch(product.id, body);
      setSaved(next);
      setServerErrors({});
      setError(null);
      setEverSaved(true);
      client.setQueryData(productKeys.detail(product.id), result);
      void client.invalidateQueries({ queryKey: productKeys.lists });
      return result;
    } catch (e) {
      setServerErrors(e instanceof ApiError ? fieldErrors(e) : {});
      setError(errorMessage(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }

  // ошибки автосохранения уже показаны текстом сервера — здесь их не нужно пробрасывать дальше
  useAutosave(form, (next) => persist(next).catch(() => undefined), { delay, enabled: autosave && valid });

  let status: AutosaveStatus;
  if (saving) status = "saving";
  else if (error) status = "error";
  else if (dirty) status = "pending";
  else status = everSaved ? "saved" : "idle";

  return {
    form,
    update: (changes: Partial<ProductForm>) => setForm((f) => ({ ...f, ...changes })),
    reset: () => {
      setForm(saved);
      setServerErrors({});
      setError(null);
    },
    /** Сохранить сейчас (кнопка, «Далее», перед публикацией). Бросает ошибку, если не получилось. */
    saveNow: () => persist(form),
    errors: { ...serverErrors, ...local },
    error,
    valid,
    dirty,
    saving,
    status,
    statusLabel: status === "error" && error ? error : AUTOSAVE_LABELS[status],
  };
}

export type ProductFormState = ReturnType<typeof useProductForm>;
