import Link from "next/link";

import { buttonClass } from "@/components/shop/ui";

export default function ShopNotFound() {
  return (
    <section className="container-site flex flex-col items-start gap-7 py-[clamp(64px,9vw,140px)]">
      <span className="kicker text-green">Ошибка 404</span>
      <h1 className="font-serif text-[clamp(44px,7vw,96px)] leading-[0.95]">Такой страницы нет</h1>
      <p className="max-w-[520px] text-[17px] text-text2">
        Возможно, товар закончился и снят с продажи или ссылка устарела. Загляните в каталог — там всё, что есть сейчас.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/catalog" className={buttonClass("primary")}>
          В каталог
        </Link>
        <Link href="/" className={buttonClass("outline")}>
          На главную
        </Link>
      </div>
    </section>
  );
}
