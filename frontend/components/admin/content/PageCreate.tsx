"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PageHeader, SectionCard } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";
import { contentKeys, PAGE_KINDS, pagesApi, slugError, type PageKind } from "@/lib/admin/content";

import { KindPicker, SlugField, TitleField } from "./PageFields";
import { RequirePermission } from "./shared";

/** Новые страницы встают в конец списков и подвала; порядок можно поменять в редакторе. */
const NEW_PAGE_ORDER = 100;

function CreateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const preset = params.get("kind");
  const [kind, setKind] = useState<PageKind>(
    PAGE_KINDS.some((k) => k.value === preset) ? (preset as PageKind) : "page",
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const titleError =
    submitted && !title.trim() ? "Введите название страницы" : (server.title ?? null);
  const slugProblem = slugError(slug, kind) ?? server.slug ?? null;

  const create = useMutation({
    mutationFn: () =>
      pagesApi.create({
        title: title.trim(),
        kind,
        slug: slug.trim() || null,
        is_published: false,
        sort_order: NEW_PAGE_ORDER,
      }),
    onSuccess: (page) => {
      void client.invalidateQueries({ queryKey: contentKeys.pages });
      client.setQueryData(contentKeys.page(page.id), page);
      toast.success("Черновик создан — теперь напишите текст");
      router.replace(`/admin/content/pages/${page.id}`);
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? fieldErrors(e) : {};
      setServer(fields);
      setError(Object.keys(fields).length ? null : errorMessage(e));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!title.trim() || slugError(slug, kind)) return;
    create.mutate();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <SectionCard>
        <div className="flex flex-col gap-5">
          <KindPicker value={kind} onChange={setKind} />
          <TitleField
            value={title}
            onChange={(v) => {
              setTitle(v);
              setServer((s) => ({ ...s, title: "" }));
            }}
            error={titleError || null}
          />
          <SlugField
            value={slug}
            onChange={(v) => {
              setSlug(v);
              setServer((s) => ({ ...s, slug: "" }));
            }}
            kind={kind}
            title={title}
            error={slugProblem || null}
          />
        </div>
      </SectionCard>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-[15px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={create.isPending}>
          {create.isPending ? "Создаём…" : "Создать черновик"}
        </Button>
      </div>
    </form>
  );
}

export function PageCreate() {
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/pages", label: "Все страницы" }}
        title="Новая страница"
        description="Сначала вид и название. Потом откроется редактор текста — пока страница черновик, всё сохраняется само, а на сайте её не видно."
      />
      <RequirePermission permission="content">
        <CreateForm />
      </RequirePermission>
    </>
  );
}
