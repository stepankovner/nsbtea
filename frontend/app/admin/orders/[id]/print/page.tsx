"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PackingSlip } from "@/components/admin/orders/PackingSlip";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/errors";
import { orderKeys, ordersApi } from "@/lib/admin/orders";

function PrintInner() {
  const { id } = useParams<{ id: string }>();
  const size = useSearchParams().get("size") === "a6" ? "a6" : "a4";
  const query = useQuery({ queryKey: orderKeys.detail(id), queryFn: () => ordersApi.get(id) });

  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: ${size === "a6" ? "A6" : "A4"}; margin: 0; }`}</style>
      <div className="mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 print:hidden">
        <Button asChild variant="outline">
          <Link href={`/admin/orders/${id}`}>← К заказу</Link>
        </Button>
        <Button asChild variant={size === "a4" ? "default" : "outline"}>
          <Link href={`/admin/orders/${id}/print`}>A4</Link>
        </Button>
        <Button asChild variant={size === "a6" ? "default" : "outline"}>
          <Link href={`/admin/orders/${id}/print?size=a6`}>A6 (наклейка)</Link>
        </Button>
        <Button onClick={() => window.print()} className="ml-auto">
          Печать
        </Button>
      </div>
      {query.isPending ? <p className="text-center">Загружаем…</p> : null}
      {query.isError ? <p className="text-center text-red-700">{errorMessage(query.error)}</p> : null}
      {query.data ? <PackingSlip order={query.data} size={size} /> : null}
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintInner />
    </Suspense>
  );
}
