import type { Schemas } from "@/lib/api/client";
import { toApiError } from "@/lib/api/errors";

import { getCsrfToken } from "./client";

export const MAX_UPLOAD_MB = 15;

async function postFiles<T>(url: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const response = await fetch(url, { method: "POST", body: form, headers, credentials: "same-origin" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

/** Загрузить картинку в медиатеку: сервер сам сожмёт и нарежет WebP. */
export function uploadMedia(file: File): Promise<Schemas["MediaOut"]> {
  const form = new FormData();
  form.append("file", file);
  return postFiles("/api/admin/media", form);
}

/** Добавить фото товару (можно несколько сразу). */
export function uploadProductImages(productId: string, files: File[]): Promise<Schemas["ProductOut"]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return postFiles(`/api/admin/products/${productId}/images`, form);
}

export function tooBig(file: File): boolean {
  return file.size > MAX_UPLOAD_MB * 1024 * 1024;
}
