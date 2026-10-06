import type { Metadata } from "next";

import { ProfileForm } from "@/components/shop/account/ProfileForm";
import { TelegramLinkBlock } from "@/components/shop/account/TelegramLinkBlock";
import { getCustomer, getSite } from "@/lib/shop-server";

export const metadata: Metadata = { title: "Профиль", robots: { index: false } };

export default async function ProfilePage() {
  const [me, site] = await Promise.all([getCustomer(), getSite()]);
  if (!me) return null;
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ProfileForm me={me} />
      <TelegramLinkBlock linked={me.telegram_linked} username={me.telegram_username} botUsername={site.telegram_bot_username} />
    </div>
  );
}
