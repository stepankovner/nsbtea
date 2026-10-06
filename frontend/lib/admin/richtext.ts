/**
 * Документ визуального редактора → только то, что принимает сервер
 * (backend/app/domain/richtext.py). Лишнее не теряем молча: блоки кода становятся абзацами.
 */
export interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
}

const NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "image",
  "horizontalRule",
  "hardBreak",
  "text",
  "productCard",
]);
const MARKS = new Set(["bold", "italic", "strike", "link", "underline"]);
const SAFE_URL = /^(https?:\/\/|\/|mailto:|tel:|#)/;

function cleanMarks(marks: DocNode["marks"]): DocNode["marks"] {
  const out = (marks ?? [])
    .filter((m) => MARKS.has(m.type))
    .flatMap((m) => {
      if (m.type !== "link") return [{ type: m.type }];
      const href = m.attrs?.href;
      return typeof href === "string" && SAFE_URL.test(href) ? [{ type: "link", attrs: { href } }] : [];
    });
  return out.length ? out : undefined;
}

function cleanNode(node: unknown): DocNode | null {
  if (!node || typeof node !== "object") return null;
  const n = node as DocNode;
  if (n.type === "text") {
    if (typeof n.text !== "string" || !n.text) return null;
    const marks = cleanMarks(n.marks);
    return marks ? { type: "text", text: n.text, marks } : { type: "text", text: n.text };
  }
  const content = (n.content ?? []).map(cleanNode).filter((c): c is DocNode => c !== null);
  if (n.type === "codeBlock") return { type: "paragraph", content };
  if (!NODES.has(n.type)) return content.length ? { type: "paragraph", content } : null;
  const out: DocNode = { type: n.type };
  if (n.type === "heading") {
    const level = Number(n.attrs?.level ?? 2);
    out.attrs = { level: Math.min(4, Math.max(2, Number.isFinite(level) ? level : 2)) };
  } else if (n.type === "image") {
    const src = n.attrs?.src;
    if (typeof src !== "string" || !SAFE_URL.test(src)) return null;
    out.attrs = { src, alt: typeof n.attrs?.alt === "string" ? n.attrs.alt : "" };
  } else if (n.type === "productCard") {
    const slug = n.attrs?.slug;
    if (typeof slug !== "string" || !slug) return null;
    out.attrs = { slug, name: typeof n.attrs?.name === "string" ? n.attrs.name : "" };
  } else if (n.attrs && n.type === "orderedList" && typeof n.attrs.start === "number") {
    out.attrs = { start: n.attrs.start };
  }
  if (content.length) out.content = content;
  return out;
}

export function toAllowedDoc(doc: unknown): DocNode {
  const cleaned = cleanNode(doc);
  if (!cleaned || cleaned.type !== "doc") return { type: "doc", content: [] };
  return { type: "doc", content: cleaned.content ?? [] };
}
