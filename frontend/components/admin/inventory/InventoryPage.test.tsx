import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InventoryPage from "@/app/admin/(app)/inventory/page";

vi.mock("next/navigation", () => ({
  // как в Next: redirect прерывает отрисовку
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/inventory",
}));

function props(searchParams: Record<string, string>) {
  return { params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) } as PageProps<"/admin/inventory">;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/admin/inventory — адрес страницы", () => {
  it("ссылка «склад этого товара» (?product=) открывает страницу товара на складе", async () => {
    await expect(InventoryPage(props({ product: "p1" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/admin/inventory/p1");
  });

  it("фильтр истории по товару остаётся во вкладке «История»", async () => {
    await InventoryPage(props({ tab: "history", product: "p1" }));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("обычный заход — без перенаправления", async () => {
    await InventoryPage(props({ tab: "reorder" }));
    expect(redirect).not.toHaveBeenCalled();
  });
});
