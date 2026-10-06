/**
 * Клиент API админки. Сессия — в httpOnly-cookie, а изменяющие запросы дополнительно
 * подписываются CSRF-токеном, который приходит при входе и в /me.
 */
import { createApi, must, type Schemas } from "@/lib/api/client";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export const adminApi = createApi({ csrf: () => csrfToken });
export { must };
export type { Schemas };
