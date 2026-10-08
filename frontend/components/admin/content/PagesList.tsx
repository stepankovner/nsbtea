"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  EmptyState,
  PageHeader,
  QueryState,
  SectionCard,
  StatusBadge,
} from "@/components/admin/page";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { contentKeys, PAGE_KINDS, pagePath, pagesApi, type AdminPage } from "@/lib/admin/content";
import { formatDate } from "@/lib/format";

import { FilterChips, RequirePermission } from "./shared";

function PageRow({ page }: { page: AdminPage }) {
  const missingLegal = page.required && !page.is_published;
  return (
    <li className="border-b last:border-b-0">
      <Link
        href={`/admin/content/pages/${page.id}`}
        className="flex flex-col gap-1 px-4 py-3.5 hover:bg-muted md:flex-row md:items-center md:gap-4"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{page.title}</span>
          <span className="truncate font-mono text-sm text-muted-foreground">{pagePath(page)}</span>
          {missingLegal ? (
            <span className="text-sm text-red-700">
              Документ не опубликован — без него нельзя запускать магазин
            </span>
          ) : null}
        </span>
        <span className="flex items-center justify-between gap-3 md:justify-end">
          <span className="text-sm text-muted-foreground">
            изменена {formatDate(page.updated_at)}
          </span>
          {page.is_published ? (
            <StatusBadge tone="success">На сайте</StatusBadge>
          ) : (
            <StatusBadge tone={missingLegal ? "danger" : "neutral"}>Черновик</StatusBadge>
          )}
        </span>
      </Link>
    </li>
  );
}

function ArchivedRow({ page }: { page: AdminPage }) {
  const client = useQueryClient();
  const restore = useMutation({
    mutationFn: () => pagesApi.restore(page.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: contentKeys.pages });
      toast.success("Страница восстановлена. Пока это черновик — опубликуйте, когда будете готовы");
    },
  });
  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{page.title}</span>
        <span className="truncate font-mono text-sm text-muted-foreground">{pagePath(page)}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        aria-label={`Восстановить «${page.title}»`}
        disabled={restore.isPending}
        onClick={() => restore.mutate()}
      >
        Восстановить
      </Button>
    </li>
  );
}

function PagesContent() {
  const pathname = usePathname();
  const params = useSearchParams();
  const archived = params.get("archived") === "1";
  const list = useQuery({
    queryKey: contentKeys.pageList(archived),
    queryFn: () => pagesApi.list(archived),
  });

  return (
    <>
      <FilterChips
        label="Какие страницы показать"
        className="mb-4"
        chips={[
          { key: "active", label: "Действующие", href: pathname, active: !archived },
          { key: "archive", label: "Архив", href: `${pathname}?archived=1`, active: archived },
        ]}
      />
      <QueryState query={list}>
        {(pages) => {
          if (archived) {
            return pages.length ? (
              <SectionCard>
                <p className="mb-2 text-[15px] text-muted-foreground">
                  Страницы из архива не видны на сайте. Восстановленная страница вернётся
                  черновиком.
                </p>
                <ul className="-mx-4 flex flex-col md:-mx-5">
                  {pages.map((p) => (
                    <ArchivedRow key={p.id} page={p} />
                  ))}
                </ul>
              </SectionCard>
            ) : (
              <EmptyState icon={Archive} title="В архиве пусто">
                Сюда попадают страницы, которые вы убрали в архив. Их можно вернуть в любой момент.
              </EmptyState>
            );
          }
          if (!pages.length) {
            return (
              <EmptyState
                icon={FileText}
                title="Пока нет страниц"
                action={
                  <Button asChild>
                    <Link href="/admin/content/pages/new">Создать страницу</Link>
                  </Button>
                }
              >
                Создайте страницу «О магазине», «Доставка и оплата» или гайд по завариванию — они
                появятся в меню и подвале сайта.
              </EmptyState>
            );
          }
          return (
            <div className="flex flex-col gap-5">
              {PAGE_KINDS.map((kind) => {
                const group = pages.filter((p) => p.kind === kind.value);
                if (!group.length) return null;
                const id = `pages-${kind.value}`;
                return (
                  <section key={kind.value} aria-labelledby={id}>
                    <h2 id={id} className="mb-2 text-lg font-semibold">
                      {kind.group}
                    </h2>
                    <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
                      {group.map((p) => (
                        <PageRow key={p.id} page={p} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

export function PagesList() {
  const { can } = useAdmin();
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content", label: "Сайт" }}
        title="Страницы"
        description="Тексты о магазине, доставке, гайды по завариванию и документы. Нажмите на страницу, чтобы изменить текст."
        actions={
          can("content") ? (
            <Button asChild size="lg">
              <Link href="/admin/content/pages/new">
                <Plus aria-hidden="true" />
                Новая страница
              </Link>
            </Button>
          ) : null
        }
      />
      <RequirePermission permission="content">
        <PagesContent />
      </RequirePermission>
    </>
  );
}
