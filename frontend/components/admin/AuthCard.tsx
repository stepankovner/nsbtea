import type { ReactNode } from "react";

import { NsbLogo } from "@/components/shop/NsbLogo";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <NsbLogo size={11} />
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-5 text-xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
