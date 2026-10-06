"use client";

import { useState } from "react";

import type { Schemas } from "@/lib/api/client";
import { srcSetOf } from "@/lib/media";

/** Фото товара. Увеличение — только по нажатию (прямой ответ на действие, правило 9). */
export function Gallery({ images }: { images: Schemas["GalleryImage"][] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const current = open !== null ? images[open] : null;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setOpen(i)}
            className="relative aspect-[4/3] overflow-hidden bg-photo"
            aria-label={`Увеличить фото: ${img.alt}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- WebP-варианты от сервера */}
            <img src={img.srcset["640"] ?? img.url} srcSet={srcSetOf(img.srcset)} sizes="(max-width: 900px) 100vw, 33vw" alt={img.alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
          </button>
        ))}
      </div>
      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setOpen(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
            if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % images.length));
            if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length));
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- полноразмерное фото */}
          <img src={current.srcset["1600"] ?? current.url} alt={current.alt} className="max-h-full max-w-full object-contain" />
          <button type="button" autoFocus onClick={() => setOpen(null)} className="absolute right-4 top-4 bg-paper px-4 py-2 text-ink">
            Закрыть
          </button>
        </div>
      ) : null}
    </>
  );
}
