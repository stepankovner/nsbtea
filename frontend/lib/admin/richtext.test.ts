import { describe, expect, it } from "vitest";

import { toAllowedDoc } from "./richtext";

describe("toAllowedDoc — текст из редактора приводится к тому, что принимает сервер", () => {
  it("разрешённое не трогает", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Заварка" }] },
        { type: "paragraph", content: [{ type: "text", text: "Текст", marks: [{ type: "bold" }] }] },
      ],
    };
    expect(toAllowedDoc(doc)).toEqual(doc);
  });

  it("заголовок первого уровня → второго, пятого → четвёртого", () => {
    const doc = toAllowedDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "А" }] },
        { type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: "Б" }] },
      ],
    });
    expect(doc.content?.map((n) => n.attrs?.level)).toEqual([2, 4]);
  });

  it("блок кода → обычный абзац, отметка «код» и неизвестные отметки убираются", () => {
    const doc = toAllowedDoc({
      type: "doc",
      content: [
        { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "y", marks: [{ type: "code" }, { type: "italic" }] }] },
      ],
    });
    expect(doc).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x = 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "y", marks: [{ type: "italic" }] }] },
      ],
    });
  });

  it("ссылки только безопасные", () => {
    const doc = toAllowedDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "плохо", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
            { type: "text", text: "хорошо", marks: [{ type: "link", attrs: { href: "https://nsbtea.ru", target: "_blank" } }] },
          ],
        },
      ],
    });
    const [bad, good] = doc.content![0]!.content!;
    expect(bad!.marks).toBeUndefined();
    expect(good!.marks).toEqual([{ type: "link", attrs: { href: "https://nsbtea.ru" } }]);
  });

  it("пустой документ — допустимый пустой doc", () => {
    expect(toAllowedDoc(null)).toEqual({ type: "doc", content: [] });
  });
});
