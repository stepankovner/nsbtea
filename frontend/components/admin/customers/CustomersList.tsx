"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EmptyState, PageHeader, QueryState } from "@/components/admin/page";
import { NoAccess } from "@/components/admin/promotions/fields";
import { useAdmin } from "@/components/admin/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerKeys, customerName, customersApi, type CustomerRow } from "@/lib/admin/customers";
import { formatPhone, formatRub, plural } from "@/lib/format";

const PER_PAGE = 30;

function Row({ customer: c }: { customer: CustomerRow }) {
  const name = customerName(c);
  const contacts = [c.phone ? formatPhone(c.phone) : null, c.email, c.telegram_username ? `@${c.telegram_username}` : null].filter(
    (v): v is string => Boolean(v) && v !== name,
  );
  return (
    <li className="border-b last:border-b-0">
      <Link
        href={`/admin/customers/${c.id}`}
        className="flex flex-col gap-1 px-4 py-3.5 hover:bg-muted md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_6.5rem_8rem_6.5rem] md:items-center md:gap-4"
      >
        <span className="min-w-0 font-medium break-words">{name}</span>
        <span className="flex min-w-0 flex-col text-sm text-muted-foreground">
          {contacts.map((v) => (
            <span key={v} className="truncate">
              {v}
            </span>
          ))}
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[15px] md:contents">
          <span className="md:text-right">
            {c.orders_count} {plural(c.orders_count, "заказ", "заказа", "заказов")}
          </span>
          <span className="tabular-nums md:text-right">
            <span className="text-muted-foreground md:hidden">покупок на </span>
            {formatRub(c.total_spent_kop)}
          </span>
          <span className="md:text-right">
            {c.points_balance} {plural(c.points_balance, "балл", "балла", "баллов")}
          </span>
        </span>
      </Link>
    </li>
  );
}

function List() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const [text, setText] = useState(q);

  const query = { q: q || undefined, page, per_page: PER_PAGE };
  const list = useQuery({ queryKey: customerKeys.list(query), queryFn: () => customersApi.list(query), placeholderData: keepPreviousData });

  function href(change: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in change)) next.delete("page");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    router.replace(href({ q: text.trim() || null }));
  }

  return (
    <>
      <PageHeader
        title="Клиенты"
        description="Все, кто оформлял заказ или входил в личный кабинет. Нажмите на клиента, чтобы увидеть его заказы, баллы и ваши заметки."
      />

      <form role="search" onSubmit={onSearch} className="mb-4 flex gap-2">
        <Input
          type="search"
          aria-label="Поиск клиентов"
          placeholder="Имя, телефон или почта"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          Найти
        </Button>
      </form>

      <QueryState query={list}>
        {(data) =>
          data.items.length ? (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                {q ? "Нашли" : "Всего"}: {data.total} {plural(data.total, "клиент", "клиента", "клиентов")}
              </p>
              <div className="overflow-hidden rounded-xl border bg-card">
                <div
                  aria-hidden="true"
                  className="hidden border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_6.5rem_8rem_6.5rem] md:gap-4"
                >
                  <span>Клиент</span>
                  <span>Контакты</span>
                  <span className="text-right">Заказов</span>
                  <span className="text-right">Сумма покупок</span>
                  <span className="text-right">Баллы</span>
                </div>
                <ul className="flex flex-col">
                  {data.items.map((c) => (
                    <Row key={c.id} customer={c} />
                  ))}
                </ul>
              </div>
              {data.total > PER_PAGE ? (
                <div className="mt-4 flex items-center justify-between gap-2">
                  {page > 1 ? (
                    <Button asChild variant="outline">
                      <Link href={href({ page: String(page - 1) })}>Назад</Link>
                    </Button>
                  ) : (
                    <span />
                  )}
                  <span className="text-sm text-muted-foreground">
                    Страница {page} из {Math.ceil(data.total / PER_PAGE)}
                  </span>
                  {page * PER_PAGE < data.total ? (
                    <Button asChild variant="outline">
                      <Link href={href({ page: String(page + 1) })}>Дальше</Link>
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ) : null}
            </>
          ) : q ? (
            <EmptyState icon={UsersRound} title="Никого не нашли">
              Проверьте написание. По телефону можно искать по последним 4 цифрам, по почте — по её части.
            </EmptyState>
          ) : (
            <EmptyState icon={UsersRound} title="Пока нет клиентов">
              Клиент появится здесь после первого заказа на сайте или входа в личный кабинет.
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}

/** Список клиентов с поиском (/admin/customers). */
export function CustomersList() {
  const { can } = useAdmin();
  if (!can("customers")) return <NoAccess section="Клиенты" />;
  return <List />;
}
