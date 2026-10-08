/** Шрифты из макета. next/font скачивает их при сборке и раздаёт с нашего домена. */
import { Golos_Text, IBM_Plex_Mono, Noto_Serif_SC, Prata, Spectral } from "next/font/google";

export const prata = Prata({
  weight: "400",
  subsets: ["latin", "cyrillic"],
  variable: "--font-prata",
  display: "swap",
});

export const golos = Golos_Text({
  weight: ["400", "500", "600"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-golos",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Иероглифы — украшение: браузер скачивает только нужные кусочки шрифта (unicode-range), без
// предзагрузки. display: optional — если шрифт не успел за ~0,1 с, на этой странице остаётся
// системный китайский шрифт и ничего не перерисовывается (иначе крупные иероглифы на карточках
// дорисовываются через секунды на медленном мобильном интернете и тормозят LCP).
export const notoSerifSc = Noto_Serif_SC({
  weight: "500",
  subsets: ["latin"],
  variable: "--font-noto-sc",
  display: "optional",
  preload: false,
});

export const spectral = Spectral({
  weight: ["500", "600"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-spectral",
  display: "swap",
});

export const fontVariables = [prata, golos, plexMono, notoSerifSc, spectral]
  .map((f) => f.variable)
  .join(" ");
