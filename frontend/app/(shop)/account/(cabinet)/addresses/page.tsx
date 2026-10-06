import type { Metadata } from "next";

import { AddressBook } from "@/components/shop/account/AddressBook";
import { must } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Адреса", robots: { index: false } };

export default async function AddressesPage() {
  const items = await must((await serverApi()).GET("/api/account/addresses"));
  return <AddressBook initial={items} />;
}
