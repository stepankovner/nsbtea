import type { Schemas } from "@/lib/api/client";

function seconds(sec: number | null | undefined): string | null {
  if (!sec) return null;
  return sec >= 60 ? `${Math.floor(sec / 60)} мин${sec % 60 ? ` ${sec % 60} с` : ""}` : `${sec} с`;
}

/** «Как заварить» — структурированный блок по способам (SPEC 3.4). */
export function Brewing({ brewing }: { brewing: Schemas["BrewingOut"] }) {
  if (!brewing.methods.length && !brewing.master_note) return null;
  return (
    <section aria-labelledby="brewing-title" className="flex flex-col gap-6">
      <h2 id="brewing-title" className="font-serif text-[clamp(28px,3vw,40px)]">
        Как заварить
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {brewing.methods.map((m) => {
          const rows: [string, string | null][] = [
            ["Посуда", m.vessel ?? null],
            ["Чай", m.grams ? `${m.grams} г${m.volume_ml ? ` на ${m.volume_ml} мл` : ""}` : null],
            ["Вода", m.temp_c ? `${m.temp_c} °C` : null],
            ["Первый пролив", seconds(m.first_steep_sec)],
            ["Следующие", seconds(m.next_steep_sec)],
            ["Проливов", m.steeps ? String(m.steeps) : null],
          ];
          return (
            <div key={m.method} className="flex flex-col gap-3 border-t border-ink pt-4">
              <span className="font-serif text-2xl">{m.method_label}</span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[15px]">
                {rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {m.note ? <p className="text-[15px] text-text2">{m.note}</p> : null}
            </div>
          );
        })}
      </div>
      {brewing.master_note ? (
        <blockquote className="border-l-2 border-red pl-4 font-serif text-xl leading-snug">{brewing.master_note}</blockquote>
      ) : null}
    </section>
  );
}
