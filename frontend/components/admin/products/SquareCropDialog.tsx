"use client";

import { useId, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { CropArea } from "./crop";

/** Окно обрезки одного фото до квадрата: двигать пальцем или мышью, масштаб — ползунком. */
export function SquareCropDialog({
  url,
  index,
  total,
  busy,
  onDone,
  onSkip,
  onRestAuto,
}: {
  url: string;
  index: number;
  total: number;
  busy: boolean;
  onDone: (area: CropArea | null) => void;
  onSkip: () => void;
  /** этот кадр — как выбран, остальные — по центру */
  onRestAuto: (area: CropArea | null) => void;
}) {
  const zoomId = useId();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onSkip()}>
      <DialogContent className="max-h-[calc(100dvh-24px)] overflow-y-auto sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            Фото {index} из {total}: обрезка до квадрата
          </DialogTitle>
          <DialogDescription>
            На сайте все фото квадратные. Передвиньте фото пальцем или мышью так, чтобы товар был в центре квадрата.
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-[min(60vh,360px)] w-full overflow-hidden rounded-lg bg-muted">
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={1}
            minZoom={1}
            maxZoom={4}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={zoomId} className="text-[15px] font-medium">
            Масштаб
          </label>
          <input
            id={zoomId}
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-11 w-full accent-[#8E3236]"
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}>
            Не добавлять это фото
          </Button>
          {total - index > 0 ? (
            <Button type="button" variant="outline" onClick={() => onRestAuto(area)} disabled={busy}>
              Остальные — по центру
            </Button>
          ) : null}
          <Button type="button" onClick={() => onDone(area)} disabled={busy}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
