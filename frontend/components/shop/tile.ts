/** Цвета плитки по виду чая (токены макета). */
export interface TileColors {
  bg: string;
  fg: string;
}

const TILES: Record<string, TileColors> = {
  green: { bg: "#5C7650", fg: "#F1EDE4" },
  white: { bg: "#E2DACA", fg: "#1D231B" },
  oolong: { bg: "#34402F", fg: "#F1EDE4" },
  red: { bg: "#8E3236", fg: "#F1EDE4" },
  puer: { bg: "#1D231B", fg: "#F1EDE4" },
  yellow: { bg: "#C2A15A", fg: "#1D231B" },
  neutral: { bg: "#E9E4D8", fg: "#1D231B" },
};

export function tileColors(color: string | null | undefined): TileColors {
  return TILES[color ?? ""] ?? TILES.neutral!;
}

/** Плашка скидки на цветной плитке: на красной — светлая, на остальных — красная. */
export function badgeColors(color: string | null | undefined): TileColors {
  return color === "red" ? { bg: "#F1EDE4", fg: "#8E3236" } : { bg: "#8E3236", fg: "#F1EDE4" };
}
