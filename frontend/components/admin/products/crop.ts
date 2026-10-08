/**
 * Обрезка фото до квадрата в браузере перед загрузкой (SPEC 10.3).
 * Заодно уменьшаем до 2000 px по стороне — загрузка с телефона идёт быстрее;
 * дальше сервер сам сожмёт фото и нарежет WebP нужных размеров.
 */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_SIDE = 2000;
const QUALITY = 0.9;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть фото — попробуйте другое (JPG, PNG или WebP)"));
    };
    img.src = url;
  });
}

/** Квадрат по выбранной области (`area` — в пикселях исходного фото) или по центру, если области нет. */
export async function cropToSquare(file: File, area: CropArea | null): Promise<File> {
  const img = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  let side = Math.min(width, height);
  let sx = (width - side) / 2;
  let sy = (height - side) / 2;
  if (area && area.width > 0 && area.height > 0) {
    side = Math.min(area.width, area.height, width, height);
    sx = Math.min(Math.max(0, area.x), width - side);
    sy = Math.min(Math.max(0, area.y), height - side);
  }
  const out = Math.max(1, Math.round(Math.min(side, MAX_SIDE)));
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не умеет обрезать фото — обновите его или загрузите фото с компьютера");
  // прозрачный фон PNG — белым, иначе в JPEG он станет чёрным
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, Math.round(sx), Math.round(sy), Math.round(side), Math.round(side), 0, 0, out, out);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Не удалось обработать фото — попробуйте ещё раз");
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
