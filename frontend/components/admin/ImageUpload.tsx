"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { MAX_UPLOAD_MB, uploadMedia } from "@/lib/admin/media";

import { Hint } from "./Hint";

type Media = Schemas["MediaOut"];

/** Одна картинка (обложка, фото блока). На телефоне можно снять камерой или выбрать из галереи. */
export function ImageUpload({
  label,
  value,
  onChange,
  hint,
  aspect = "aspect-[4/3]",
}: {
  label: string;
  value: Media | null;
  onChange: (media: Media | null) => void;
  hint?: React.ReactNode;
  aspect?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Это не картинка — выберите фото в формате JPG, PNG или WebP");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Файл больше ${MAX_UPLOAD_MB} МБ — уменьшите фото и попробуйте снова`);
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadMedia(file));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center gap-1">
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        {hint ? <Hint label={label}>{hint}</Hint> : null}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className={`${aspect} w-full max-w-xs overflow-hidden rounded-lg border bg-muted`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- превью из медиатеки */}
            <img src={value.srcset["320"] ?? value.url} alt={label} className="h-full w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
              Заменить
            </Button>
            <Button type="button" variant="ghost" onClick={() => onChange(null)} aria-label="Убрать картинку">
              Убрать
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className={`${aspect} flex w-full max-w-xs flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-card text-muted-foreground hover:bg-muted`}
        >
          {busy ? <Loader2 className="size-6 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-6" aria-hidden="true" />}
          <span className="text-sm">{busy ? "Загружаем…" : "Выбрать фото"}</span>
        </button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">JPG, PNG или WebP до {MAX_UPLOAD_MB} МБ. Сожмём сами.</p>
      )}
    </div>
  );
}
