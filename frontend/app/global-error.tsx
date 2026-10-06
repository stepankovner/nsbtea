"use client";

/** Последний рубеж: ошибка в корневом шаблоне. Без внешних стилей — только самое нужное. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#F1EDE4", color: "#1D231B", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ padding: "64px 24px", maxWidth: 640 }}>
          <h1 style={{ fontWeight: 400, fontSize: 40 }}>Сайт временно недоступен</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6 }}>Мы уже знаем о проблеме. Попробуйте обновить страницу через минуту.</p>
          <button type="button" onClick={reset} style={{ background: "#8E3236", color: "#F1EDE4", border: 0, padding: "14px 24px", fontSize: 16 }}>
            Обновить
          </button>
        </main>
      </body>
    </html>
  );
}
