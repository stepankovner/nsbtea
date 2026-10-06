import type { Schemas } from "@/lib/api/client";
import { srcSetOf } from "@/lib/media";

/** Картинка из медиатеки (WebP разных размеров) или заштрихованное место под фото. */
export function Picture({
  media,
  alt,
  sizes = "100vw",
  className = "h-full w-full object-cover",
  placeholder,
  priority = false,
}: {
  media: Schemas["MediaOut"] | null | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  placeholder?: string;
  priority?: boolean;
}) {
  if (!media) {
    return (
      <div className="photo-placeholder flex h-full w-full items-center justify-center" role="img" aria-label={alt}>
        {placeholder ? (
          <span className="bg-paper px-2.5 py-1.5 font-mono text-xs text-[#4E5649]">{placeholder}</span>
        ) : null}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- варианты WebP нарезаны сервером
    <img
      src={media.srcset["1024"] ?? media.url}
      srcSet={srcSetOf(media.srcset)}
      sizes={sizes}
      width={media.width}
      height={media.height}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}
