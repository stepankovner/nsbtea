"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApiError, errorMessage } from "@/lib/api/errors";

function onAuthError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // сессия истекла: полная перезагрузка сбрасывает кеш запросов с чужими правами
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/admin/login?next=${next}`);
    return true;
  }
  return false;
}

export function AdminQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: (error) => void onAuthError(error) }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (onAuthError(error)) return;
            // если у мутации нет своей обработки — показываем текст ошибки сервера
            if (!mutation.options.onError) toast.error(errorMessage(error));
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
