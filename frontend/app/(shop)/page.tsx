import type { Metadata } from "next";

import {
  AboutBlock,
  AdvantagesBlock,
  EventsBlock,
  HeroBlock,
  ProductsBlock,
  ServicesBlock,
  ThursdayBlock,
  WholesaleBlock,
} from "@/components/shop/home/blocks";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { getSite, PUBLIC_BASE_URL } from "@/lib/shop-server";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    title: { absolute: site.seo_home_title },
    description: site.seo_home_description,
    alternates: { canonical: `${PUBLIC_BASE_URL}/` },
    openGraph: { title: site.seo_home_title, description: site.seo_home_description, url: `${PUBLIC_BASE_URL}/` },
  };
}

export default async function HomePage() {
  const home = await must((await serverApi()).GET("/api/home"));
  return (
    <>
      {home.blocks.map((block) => {
        switch (block.kind) {
          case "hero":
            return <HeroBlock key={block.kind} block={block} />;
          case "thursday":
            return <ThursdayBlock key={block.kind} block={block} />;
          case "services":
            return <ServicesBlock key={block.kind} block={block} />;
          case "featured":
          case "new_products":
            return <ProductsBlock key={block.kind} block={block} />;
          case "sets":
            return <ProductsBlock key={block.kind} block={block} moreHref="/catalog/nabory" />;
          case "events":
            return <EventsBlock key={block.kind} block={block} />;
          case "about":
            return <AboutBlock key={block.kind} block={block} />;
          case "advantages":
            return <AdvantagesBlock key={block.kind} block={block} />;
          case "wholesale":
            return <WholesaleBlock key={block.kind} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}
