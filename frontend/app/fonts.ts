/**
 * Шрифты из макета — файлы лежат в репозитории (app/fonts, лицензия SIL OFL 1.1, тексты рядом).
 * Сборка не ходит в интернет: Google Fonts при сборке на сервере может не ответить, и тогда
 * сайт не соберётся. Файлы обрезаны до латиницы, кириллицы и знаков (₽, №, стрелки) —
 * все шрифты вместе около 110 КБ. Как пересобрать — app/fonts/README.md.
 */
import localFont from "next/font/local";

export const prata = localFont({
  src: "./fonts/prata-400.woff2",
  weight: "400",
  variable: "--font-prata",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

// вариативный шрифт: одно начертание-файл на 400–600
export const golos = localFont({
  src: "./fonts/golos-text-400-600.woff2",
  weight: "400 600",
  variable: "--font-golos",
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

// Второстепенные шрифты (мелкие подписи, логотип) — без предзагрузки: на медленном мобильном
// интернете предзагрузка всех начертаний отодвигала первую отрисовку страницы.
export const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
});

// в логотипе только буквы «НСБ ЧАЙ» — файл обрезан до них (5 КБ)
export const spectral = localFont({
  src: [
    { path: "./fonts/spectral-logo-500.woff2", weight: "500" },
    { path: "./fonts/spectral-logo-600.woff2", weight: "600" },
  ],
  variable: "--font-spectral",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
});

export const fontVariables = [prata, golos, plexMono, spectral].map((f) => f.variable).join(" ");
