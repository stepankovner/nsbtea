import type { Metadata, Viewport } from "next";

import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: { default: "НСБ Чай — китайский чай во Владимире", template: "%s — НСБ Чай" },
  description: "Пуэры, улуны, красные, белые и зелёные чаи с доставкой по Владимиру и России.",
  applicationName: "НСБ Чай",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F1EDE4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={fontVariables}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
