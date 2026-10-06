import type { Metadata } from "next";

import { ContentPage, loadPage, pageMetadata } from "@/components/shop/content/ContentPage";

export async function generateMetadata(props: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return pageMetadata(await loadPage(slug, "legal"));
}

export default async function LegalPage(props: PageProps<"/legal/[slug]">) {
  const { slug } = await props.params;
  return <ContentPage page={await loadPage(slug, "legal")} kicker="Документы" />;
}
