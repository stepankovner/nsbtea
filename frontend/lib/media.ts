/** srcset из WebP-вариантов, которые нарезает backend: {"320": url, "640": url, "original": url}. */
export function srcSetOf(srcset: Record<string, string> | undefined | null): string | undefined {
  if (!srcset) return undefined;
  const widths = Object.entries(srcset)
    .filter(([name]) => /^\d+$/.test(name))
    .map(([name, url]) => [Number(name), url] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!widths.length) return undefined;
  return widths.map(([w, url]) => `${url} ${w}w`).join(", ");
}
