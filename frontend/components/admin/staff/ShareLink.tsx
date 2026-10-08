"use client";

import { Copy, Share2 } from "lucide-react";
import { useId, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Ссылка крупно + «Скопировать» и «Отправить» (системное меню «Поделиться» на телефоне, если оно есть). */
export function ShareLink({ url, label, shareTitle, shareText }: { url: string; label: string; shareTitle: string; shareText: string }) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("нет доступа к буферу обмена");
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована");
    } catch {
      field.current?.select();
      toast.error("Не получилось скопировать само — ссылка выделена, скопируйте её вручную");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url });
    } catch (e) {
      // пользователь просто закрыл меню «Поделиться»
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Не получилось открыть «Поделиться» — скопируйте ссылку");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </Label>
      <Textarea
        id={id}
        ref={field}
        readOnly
        value={url}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        className="resize-none font-mono text-base leading-relaxed break-all"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" size="lg" onClick={() => void copy()}>
          <Copy aria-hidden="true" />
          Скопировать
        </Button>
        {canShare() ? (
          <Button type="button" size="lg" variant="outline" onClick={() => void share()}>
            <Share2 aria-hidden="true" />
            Отправить
          </Button>
        ) : null}
      </div>
    </div>
  );
}
