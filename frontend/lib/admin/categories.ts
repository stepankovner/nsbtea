/** Категории каталога: двухуровневое дерево (SPEC 3.1). */
import { adminApi, must, type Schemas } from "./client";

export type AdminCategory = Schemas["CategoryOut"];
export type TileColor = Schemas["TileColor"];
export type CategoryCreate = Partial<Schemas["CategoryIn"]> & { name: string };

const path = (id: string) => ({ params: { path: { category_id: id } } });

export const categoriesApi = {
  /** Действующие категории деревом; с `archived` — только убранные в архив. */
  list: (archived?: boolean) =>
    must(adminApi.GET("/api/admin/categories", { params: { query: archived ? { archived: true } : {} } })),
  create: (body: CategoryCreate) => must(adminApi.POST("/api/admin/categories", { body: body as Schemas["CategoryIn"] })),
  patch: (id: string, body: Schemas["CategoryPatch"]) => must(adminApi.PATCH("/api/admin/categories/{category_id}", { ...path(id), body })),
  /** Новый порядок внутри одного уровня (основные или подкатегории одной категории). */
  reorder: (ids: string[]) => must(adminApi.POST("/api/admin/categories/reorder", { body: { ids } })),
  archive: (id: string) => must(adminApi.DELETE("/api/admin/categories/{category_id}", path(id))),
  restore: (id: string) => must(adminApi.POST("/api/admin/categories/{category_id}/restore", path(id))),
};

export const categoryKeys = {
  all: ["products", "categories"] as const,
  list: (archived: boolean) => ["products", "categories", archived] as const,
};

export interface CategoryOption {
  id: string;
  name: string;
  depth: 0 | 1;
}

/** Дерево → плоский список для выпадающего списка (подкатегории — с отступом). */
export function categoryOptions(tree: AdminCategory[]): CategoryOption[] {
  return tree.flatMap((root) => [
    { id: root.id, name: root.name, depth: 0 as const },
    ...root.children.map((child) => ({ id: child.id, name: child.name, depth: 1 as const })),
  ]);
}

export function findCategory(tree: AdminCategory[], id: string | null | undefined): AdminCategory | null {
  if (!id) return null;
  for (const root of tree) {
    if (root.id === id) return root;
    const child = root.children.find((c) => c.id === id);
    if (child) return child;
  }
  return null;
}

export const TILE_COLORS: { value: TileColor; label: string }[] = [
  { value: "neutral", label: "Светлый (посуда, наборы)" },
  { value: "puer", label: "Тёмный (пуэры)" },
  { value: "oolong", label: "Тёмно-зелёный (улуны)" },
  { value: "red", label: "Красный (красный чай)" },
  { value: "green", label: "Зелёный" },
  { value: "white", label: "Бежевый (белый чай)" },
  { value: "yellow", label: "Жёлтый" },
];
