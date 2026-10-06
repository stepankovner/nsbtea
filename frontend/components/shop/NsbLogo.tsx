import clsx from "clsx";

/** Логотип «печать» (вариант 1b из макета). Размеры — в em от font-size. */
export function NsbLogo({
  size = 12,
  tone = "light",
  tagline = false,
  className,
}: {
  size?: number;
  tone?: "light" | "dark";
  tagline?: boolean;
  className?: string;
}) {
  const ink = tone === "dark" ? "#F1EDE4" : "#1D231B";
  const red = tone === "dark" ? "#B9494C" : "#8E3236";
  return (
    <span
      className={clsx("inline-flex items-center leading-none", className)}
      style={{ fontSize: size, color: ink, fontFamily: "var(--font-logo)" }}
    >
      <span className="flex items-center gap-[0.75em]">
        <span aria-hidden="true" style={{ background: red, padding: "0.22em", borderRadius: "0.1em" }}>
          <span
            className="grid text-center"
            style={{
              border: "0.07em solid #F1EDE4",
              borderRadius: "0.05em",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridTemplateRows: "1fr 1fr",
              gap: "0.12em 0.1em",
              padding: "0.24em 0.3em",
              fontWeight: 600,
              fontSize: "1.1em",
              color: "#F1EDE4",
            }}
          >
            {["Н", "С", "Б", "Ч", "А", "Й"].map((letter) => (
              <span key={letter}>{letter}</span>
            ))}
          </span>
        </span>
        <span className="flex flex-col" style={{ gap: "0.55em" }}>
          <span style={{ fontWeight: 500, fontSize: "1.55em", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
            НСБ ЧАЙ
          </span>
          {tagline ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.5em",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: tone === "dark" ? "#93AC85" : "#5C7650",
              }}
            >
              Китайский чай · Владимир
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
