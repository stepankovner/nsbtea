import type { Metadata } from "next";

import { ApplicationForm } from "@/components/shop/ApplicationForm";
import { ContentPage, loadPage, pageMetadata } from "@/components/shop/content/ContentPage";
import { getSite } from "@/lib/shop-server";

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return pageMetadata(await loadPage(slug, "page"));
}

async function ContactsAside() {
  const { store } = await getSite();
  const rows = [
    ["Телефон", store.phone],
    ["Почта", store.email],
    ["Адрес", store.address],
    ["Часы работы", store.work_hours],
  ].filter(([, v]) => v);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 border-t border-ink pt-5 text-[17px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      {store.telegram_url ? (
        <div className="contents">
          <dt className="text-muted">Telegram</dt>
          <dd>
            <a href={store.telegram_url} target="_blank" rel="noopener noreferrer" className="text-red underline">
              Написать
            </a>
          </dd>
        </div>
      ) : null}
    </dl>
  );
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
  return <ContentPage page={page} aside={slug === "contacts" ? <ContactsAside /> : undefined} />;
}
