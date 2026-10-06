import { NextResponse, type NextRequest } from "next/server";

/**
 * Быстрая (оптимистичная) проверка входа: нет cookie сессии — сразу на страницу входа
 * с возвратом обратно. Настоящую проверку делает backend на каждом запросе.
 */
const CUSTOMER_COOKIE = "nsb_session";
const ADMIN_COOKIE = "nsb_admin";
const ADMIN_PUBLIC = ["/admin/login", "/admin/invite", "/admin/reset"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const next = encodeURIComponent(`${pathname}${search}`);

  if (pathname.startsWith("/account") && !pathname.startsWith("/account/login")) {
    if (!request.cookies.has(CUSTOMER_COOKIE)) {
      return NextResponse.redirect(new URL(`/account/login?next=${next}`, request.url));
    }
  }
  if (pathname.startsWith("/admin") && !ADMIN_PUBLIC.some((p) => pathname.startsWith(p))) {
    if (!request.cookies.has(ADMIN_COOKIE)) {
      return NextResponse.redirect(new URL(`/admin/login?next=${next}`, request.url));
    }
  }
  const headers = new Headers(request.headers);
  headers.set("x-pathname", `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};
