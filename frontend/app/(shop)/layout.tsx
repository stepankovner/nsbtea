import { Suspense } from "react";

import { CartProvider } from "@/components/shop/cart-context";
import { CartToast } from "@/components/shop/CartToast";
import { CookieBar } from "@/components/shop/CookieBar";
import { Footer } from "@/components/shop/Footer";
import { Header } from "@/components/shop/Header";
import { Metrika } from "@/components/shop/Metrika";
import { jsonLdString, organizationJsonLd } from "@/lib/seo";
import { getSite, PUBLIC_BASE_URL } from "@/lib/shop-server";

export async function generateMetadata() {
  const site = await getSite();
  return {
    title: { default: site.seo_home_title, template: "%s — НСБ Чай" },
    description: site.seo_home_description,
    verification: site.yandex_verification ? { yandex: site.yandex_verification } : undefined,
    openGraph: { siteName: "НСБ Чай", locale: "ru_RU", type: "website" },
  };
}

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const site = await getSite();
  return (
    <CartProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Перейти к содержимому
      </a>
      <Header site={site} />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <Footer site={site} />
      <CartToast />
      <CookieBar />
      {site.metrika_id ? (
        <Suspense fallback={null}>
          <Metrika id={site.metrika_id} />
        </Suspense>
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(organizationJsonLd(site, PUBLIC_BASE_URL)) }}
      />
    </CartProvider>
  );
}
