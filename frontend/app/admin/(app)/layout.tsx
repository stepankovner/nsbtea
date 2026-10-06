"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSessionProvider } from "@/components/admin/session";

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}
