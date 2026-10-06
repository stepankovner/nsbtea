import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminQueryProvider } from "@/lib/admin/query";

export const metadata: Metadata = {
  title: { default: "Админка", template: "%s — админка НСБ Чай" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin min-h-dvh bg-background text-foreground antialiased">
      <AdminQueryProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster richColors closeButton />
      </AdminQueryProvider>
    </div>
  );
}
