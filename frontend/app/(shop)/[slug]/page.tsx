import type { Metadata } from "next";

import { ApplicationForm } from "@/components/shop/ApplicationForm";
import { ContactsDetails, DeliveryPaymentDetails } from "@/components/shop/content/BuyerInfo";
import { ContentPage, loadPage, pageMetadata } from "@/components/shop/content/ContentPage";
import { getSite } from "@/lib/shop-server";

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return pageMetadata(await loadPage(slug, "page"));
}

export default async function InfoPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const page = await loadPage(slug, "page");

  if (slug === "wholesale") {
    return (
      <ContentPage page={page} kicker="Для кафе, ресторанов и магазинов">
        <div className="mt-4 bg-block p-[clamp(20px,3vw,40px)]">
          <h2 className="mb-6 font-serif text-[32px]">Запросить оптовый прайс</h2>
          <ApplicationForm type="wholesale" />
        </div>
      </ContentPage>
    );
  }
  if (slug === "ceremonies") {
    return (
      <ContentPage page={page} kicker="На заказ">
        <div className="mt-4 bg-forest p-[clamp(20px,3vw,40px)] text-paper">
          <h2 className="mb-6 font-serif text-[32px]">Оставить заявку</h2>
          <ApplicationForm type="private_ceremony" tone="dark" />
        </div>
      </ContentPage>
    );
  }
  // реквизиты, доставка и оплата — из настроек магазина: банк проверяет их перед подключением оплаты
  if (slug === "contacts" || slug === "delivery") {
    const site = await getSite();
    const aside = slug === "contacts" ? <ContactsDetails site={site} /> : <DeliveryPaymentDetails site={site} />;
    return <ContentPage page={page} aside={aside} />;
  }
  return <ContentPage page={page} />;
}
