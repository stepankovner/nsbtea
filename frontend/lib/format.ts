/**
 * Форматирование для интерфейса. Деньги — целые копейки (как на сервере), время — по Москве.
 */

export const NBSP = " ";
const MINUS = "−";
export const TIME_ZONE = "Europe/Moscow";

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** «1 200 ₽», «123,50 ₽» — с неразрывными пробелами, как `format_rub` на сервере. */
export function formatRub(kop: number): string {
  const sign = kop < 0 ? MINUS : "";
  const abs = Math.abs(Math.trunc(kop));
  const rub = Math.floor(abs / 100);
  const rest = abs % 100;
  const text = groupThousands(rub) + (rest ? `,${String(rest).padStart(2, "0")}` : "");
  return `${sign}${text}${NBSP}₽`;
}

/** Рубли из поля ввода → копейки. `null`, если это не цена. */
export function rubToKop(input: string): number | null {
  const cleaned = input.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rub = "0", frac = ""] = cleaned.split(".");
  return Number(rub) * 100 + Number(frac.padEnd(2, "0"));
}

/** Копейки → текст для поля ввода в рублях («1200», «12,50»). */
export function kopToRubInput(kop: number | null | undefined): string {
  if (kop === null || kop === undefined) return "";
  const rub = Math.floor(kop / 100);
  const rest = kop % 100;
  return rest ? `${rub},${String(rest).padStart(2, "0")}` : String(rub);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs % 10 === 1 && abs % 100 !== 11) return one;
  if (abs % 10 >= 2 && abs % 10 <= 4 && !(abs % 100 >= 12 && abs % 100 <= 14)) return few;
  return many;
}

export function formatGrams(grams: number): string {
  return `${groupThousands(grams)}${NBSP}г`;
}

export function formatQty(type: string, qty: number): string {
  return type === "tea" ? formatGrams(qty) : `${groupThousands(qty)}${NBSP}шт.`;
}

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

interface MoscowParts {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
}

function moscowParts(value: string | Date): MoscowParts {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** «8 октября 2026» (по Москве). */
export function formatDate(value: string | Date): string {
  const p = moscowParts(value);
  return `${p.day} ${MONTHS_GENITIVE[p.month - 1]} ${p.year}`;
}

/** «5 октября 2026, 12:00» (по Москве). */
export function formatDateTime(value: string | Date): string {
  const p = moscowParts(value);
  return `${p.day} ${MONTHS_GENITIVE[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** «5 октября, 12:00» — без года, для списков текущего года. */
export function formatDayTime(value: string | Date): string {
  const p = moscowParts(value);
  return `${p.day} ${MONTHS_GENITIVE[p.month - 1]}, ${p.hour}:${p.minute}`;
}

/** «+7 900 123-45-67». */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone;
}
