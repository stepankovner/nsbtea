"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { adminAuth } from "@/lib/admin/auth";
import { setCsrfToken } from "@/lib/admin/client";
import { can as canSee, type Permission } from "@/lib/admin/nav";

type User = Schemas["AdminUserOut"];

interface Session {
  user: User;
  can: (permission: Permission) => boolean;
  isOwner: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      adminAuth.me().then(
        (me) => {
          setCsrfToken(me.csrf_token);
          setUser(me.user);
          setError(null);
        },
        (e: unknown) => {
          if (e instanceof ApiError && e.status === 401) {
            router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
          } else {
            setError(errorMessage(e));
          }
        },
      ),
    [router, pathname],
  );

  useEffect(() => {
    void load();
    // проверяем сессию один раз при открытии админки
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Session | null>(
    () =>
      user
        ? {
            user,
            isOwner: user.is_owner,
            can: (permission) => canSee(user, { permission }),
            refresh: load,
            logout: async () => {
              await adminAuth.logout().catch(() => undefined);
              setCsrfToken(null);
              // полная перезагрузка: после выхода в памяти не остаётся данных админки и кеша запросов
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/admin/login");
            },
          }
        : null,
    [user, load],
  );

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg">Не удалось открыть админку: {error}</p>
        <Button onClick={() => void load()}>Попробовать ещё раз</Button>
      </div>
    );
  }
  if (!value) {
    return <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Загружаем…</div>;
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAdmin(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useAdmin: нет AdminSessionProvider");
  return session;
}

/** Сессия для тестов и сторибуков: без запроса к серверу. */
export function TestAdminSession({ user, children }: { user: User; children: ReactNode }) {
  const value: Session = {
    user,
    isOwner: user.is_owner,
    can: (permission) => canSee(user, { permission }),
    refresh: async () => undefined,
    logout: async () => undefined,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
