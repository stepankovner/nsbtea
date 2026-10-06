/** Обёртка для тестов админки: кэш запросов и сессия сотрудника без похода на сервер. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { TestAdminSession } from "@/components/admin/session";

export function renderWithAdmin(
  ui: ReactElement,
  { owner = true, permissions = [] as string[] }: { owner?: boolean; permissions?: string[] } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = {
    id: "u1",
    name: owner ? "Никита" : "Аня",
    email: "u@nsbtea.ru",
    role: owner ? "owner" : "staff",
    permissions,
    telegram_linked: true,
    expires_at: null,
    is_owner: owner,
  };
  return render(
    <QueryClientProvider client={client}>
      <TestAdminSession user={user}>{ui}</TestAdminSession>
    </QueryClientProvider>,
  );
}
