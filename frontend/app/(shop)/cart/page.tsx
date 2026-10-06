import type { Metadata } from "next";

import { CartView } from "@/components/shop/cart/CartView";
import { CheckoutForm } from "@/components/shop/checkout/CheckoutForm";
import { getCustomer, getSite } from "@/lib/shop-server";

export const metadata: Metadata = { title: "Корзина", robots: { index: false } };

export default async function CartPage() {
  const [site, customer] = await Promise.all([getSite(), getCustomer()]);
  return (
    <section className="container-site pb-[clamp(80px,9vw,140px)] pt-[clamp(40px,5vw,72px)]">
      <h1 className="mb-10 font-serif text-[clamp(52px,7vw,104px)] leading-[0.95]">Корзина</h1>
      <div className="flex flex-wrap items-start gap-x-[clamp(32px,5vw,72px)] gap-y-12">
        <div className="min-w-0 flex-[3_1_480px]">
          <CartView loggedIn={customer !== null} />
        </div>
        <div className="w-full max-w-[520px] flex-[2_1_360px] lg:sticky lg:top-24">
          <CheckoutForm
            site={site}
            customer={customer ? { name: customer.name ?? "", phone: customer.phone ?? "", email: customer.email ?? "" } : null}
          />
        </div>
      </div>
    </section>
  );
}
