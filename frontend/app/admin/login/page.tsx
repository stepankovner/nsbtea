"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AdminLogin } from "@/components/admin/AdminLogin";
import { AuthCard } from "@/components/admin/AuthCard";
import { setCsrfToken } from "@/lib/admin/client";

function LoginInner() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const target = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
  return (
    <AdminLogin
      onSuccess={(_user, csrf) => {
        setCsrfToken(csrf);
        router.replace(target);
      }}
    />
  );
}

export default function AdminLoginPage() {
  return (
    <AuthCard title="Вход в админку">
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
    </AuthCard>
  );
}
