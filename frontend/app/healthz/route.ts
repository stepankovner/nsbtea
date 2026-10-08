/** Проверка, что сайт запущен (healthcheck Docker, внешний мониторинг). К backend не обращается. */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response("ok", { status: 200, headers: { "cache-control": "no-store", "content-type": "text/plain" } });
}
