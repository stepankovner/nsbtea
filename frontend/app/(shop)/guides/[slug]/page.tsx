import type { Metadata } from "next";

import { ContentPage, loadPage, pageMetadata } from "@/components/shop/content/ContentPage";

export async function generateMetadata(props: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return pageMetadata(await loadPage(slug, "guide"));
}

export default async function GuidePage(props: PageProps<"/guides/[slug]">) {
  const { slug } = await props.params;
  return <ContentPage page={await loadPage(slug, "guide")} kicker="Как заваривать" />;
}
