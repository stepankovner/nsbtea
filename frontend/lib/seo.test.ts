import { describe, expect, it } from "vitest";

import { productPage, site } from "@/tests/fixtures";

import { breadcrumbsJsonLd, eventJsonLd, organizationJsonLd, productJsonLd } from "./seo";

const BASE = "https://nsbtea.ru";

describe("разметка schema.org", () => {
  it("Product + Offer: цена в рублях, наличие, картинки", () => {
    const ld = productJsonLd(
      productPage({
        price_kop: 112_000,
        images: [
          { url: "/media/a/original.webp", srcset: {}, alt: "Да Хун Пао", width: 1200, height: 1200 },
        ],
      }),
      BASE,
    );
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Да Хун Пао",
      image: ["https://nsbtea.ru/media/a/original.webp"],
      offers: {
        "@type": "Offer",
        priceCurrency: "RUB",
        price: "1120.00",
        availability: "https://schema.org/InStock",
        url: "https://nsbtea.ru/product/da-hun-pao",
      },
    });
  });

  it("нет в наличии", () => {
    const ld = productJsonLd(productPage({ in_stock: false }), BASE) as { offers: { availability: string } };
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("хлебные крошки с полными адресами", () => {
    expect(
      breadcrumbsJsonLd(
        [
          { name: "Каталог", href: "/catalog" },
          { name: "Улун", href: "/catalog/ulun" },
        ],
        BASE,
      ),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Каталог", item: "https://nsbtea.ru/catalog" },
        { "@type": "ListItem", position: 2, name: "Улун", item: "https://nsbtea.ru/catalog/ulun" },
      ],
    });
  });

  it("Organization из настроек магазина", () => {
    expect(organizationJsonLd(site(), BASE)).toMatchObject({
      "@type": "Organization",
      name: "НСБ Чай",
      url: "https://nsbtea.ru",
      telephone: "+7 900 000-00-00",
      email: "shop@nsbtea.ru",
      sameAs: ["https://t.me/nsbtea"],
    });
  });

  it("Event", () => {
    expect(
      eventJsonLd(
        {
          slug: "ceremony-1",
          title: "Чайная церемония: пуэры",
          starts_at: "2026-10-10T15:00:00Z",
          ends_at: null,
          place: "Владимир, ул. Примерная, 1",
          price_kop: 120_000,
          short_description: "Три пуэра",
          cover: null,
          seats_left: 0,
        },
        BASE,
      ),
    ).toMatchObject({
      "@type": "Event",
      name: "Чайная церемония: пуэры",
      startDate: "2026-10-10T15:00:00Z",
      location: { "@type": "Place", name: "Владимир, ул. Примерная, 1" },
      offers: { price: "1200.00", priceCurrency: "RUB", availability: "https://schema.org/SoldOut" },
      url: "https://nsbtea.ru/events/ceremony-1",
    });
  });
});
