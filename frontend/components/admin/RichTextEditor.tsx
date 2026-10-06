"use client";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Package,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/errors";
import { MAX_UPLOAD_MB, uploadMedia } from "@/lib/admin/media";
import { toAllowedDoc, type DocNode } from "@/lib/admin/richtext";
import { cn } from "@/lib/utils";

import { Hint } from "./Hint";
import { ProductPicker } from "./ProductPicker";
import { ProductCardNode } from "./richtext/productCardNode";

function ToolButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted disabled:opacity-40",
        active && "bg-muted text-[#8E3236]",
      )}
    >
      {children}
    </button>
  );
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const id = useId();
  const [href, setHref] = useState<string>(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const valid = /^(https?:\/\/|\/|mailto:|tel:)/.test(href.trim());
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ссылка</DialogTitle>
          <DialogDescription>
            Выделите слова в тексте и вставьте адрес. Ссылки на свой сайт можно писать коротко: /catalog
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-[15px] font-medium">
            Адрес
          </label>
          <Input
            id={id}
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://… или /catalog"
            autoFocus
          />
          {href && !valid ? (
            <p className="text-sm text-destructive">Адрес должен начинаться с https://, / или mailto:</p>
          ) : null}
        </div>
        <DialogFooter>
          {editor.isActive("link") ? (
            <Button
              variant="outline"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                onClose();
              }}
            >
              Убрать ссылку
            </Button>
          ) : null}
          <Button
            disabled={!valid}
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
              onClose();
            }}
          >
            Применить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Визуальный редактор текста страниц, событий и описаний (TipTap). Только разрешённые элементы. */
export function RichTextEditor({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: unknown;
  onChange: (doc: DocNode) => void;
  hint?: ReactNode;
}) {
  const labelId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"] },
      }),
      Image.configure({ inline: false }),
      ProductCardNode,
    ],
    content: value && typeof value === "object" ? (value as object) : { type: "doc", content: [] },
    editorProps: {
      attributes: {
        class: "prose-nsb min-h-[220px] px-4 py-3 outline-none",
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChange(toAllowedDoc(e.getJSON())),
  });

  async function onImage(file: File | undefined) {
    if (!file || !editor) return;
    setImageError(null);
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setImageError(`Файл больше ${MAX_UPLOAD_MB} МБ — уменьшите фото`);
      return;
    }
    setUploading(true);
    try {
      const media = await uploadMedia(file);
      editor
        .chain()
        .focus()
        .setImage({ src: media.srcset["1024"] ?? media.url, alt: "" })
        .run();
    } catch (e) {
      setImageError(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const ready = editor !== null;
  const tools: { label: string; icon: ReactNode; active?: boolean; run: () => void; disabled?: boolean }[] = [
    {
      label: "Заголовок",
      icon: <Heading2 className="size-5" aria-hidden="true" />,
      active: editor?.isActive("heading", { level: 2 }),
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Подзаголовок",
      icon: <Heading3 className="size-5" aria-hidden="true" />,
      active: editor?.isActive("heading", { level: 3 }),
      run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Жирный",
      icon: <Bold className="size-5" aria-hidden="true" />,
      active: editor?.isActive("bold"),
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "Курсив",
      icon: <Italic className="size-5" aria-hidden="true" />,
      active: editor?.isActive("italic"),
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "Список",
      icon: <List className="size-5" aria-hidden="true" />,
      active: editor?.isActive("bulletList"),
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Нумерованный список",
      icon: <ListOrdered className="size-5" aria-hidden="true" />,
      active: editor?.isActive("orderedList"),
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Цитата",
      icon: <Quote className="size-5" aria-hidden="true" />,
      active: editor?.isActive("blockquote"),
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Ссылка",
      icon: <Link2 className="size-5" aria-hidden="true" />,
      active: editor?.isActive("link"),
      run: () => setLinkOpen(true),
    },
    {
      label: "Карточка товара",
      icon: <Package className="size-5" aria-hidden="true" />,
      run: () => setProductOpen(true),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center gap-1">
        <span id={labelId} className="text-[15px] font-medium">
          {label}
        </span>
        {hint ? <Hint label={label}>{hint}</Hint> : null}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div role="toolbar" aria-label="Оформление текста" className="flex flex-wrap gap-0.5 border-b bg-muted/40 p-1">
          {tools.map((t) => (
            <ToolButton key={t.label} label={t.label} active={t.active} disabled={!ready || t.disabled} onClick={t.run}>
              {t.icon}
            </ToolButton>
          ))}
          <ToolButton label="Картинка" disabled={!ready || uploading} onClick={() => fileInput.current?.click()}>
            <ImagePlus className="size-5" aria-hidden="true" />
          </ToolButton>
          <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
          <ToolButton label="Отменить" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 className="size-5" aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Повторить" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 className="size-5" aria-hidden="true" />
          </ToolButton>
        </div>
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onImage(e.target.files?.[0])}
      />
      {imageError ? (
        <p role="alert" className="text-sm text-destructive">
          {imageError}
        </p>
      ) : null}
      {uploading ? <p className="text-sm text-muted-foreground">Загружаем картинку…</p> : null}
      {editor && linkOpen ? <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} /> : null}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Карточка товара в тексте</DialogTitle>
            <DialogDescription>
              На сайте покажется карточка с актуальной ценой и ссылкой на товар.
            </DialogDescription>
          </DialogHeader>
          <ProductPicker
            label="Товар"
            value={[]}
            onChange={() => undefined}
            onPickProduct={(product) => {
              editor?.chain().focus().insertProductCard({ slug: product.slug, name: product.name }).run();
              setProductOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
