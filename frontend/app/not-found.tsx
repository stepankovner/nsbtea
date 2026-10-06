import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-center gap-6 px-[clamp(20px,4vw,56px)]">
      <span className="kicker text-green">Ошибка 404</span>
      <h1 className="font-serif text-[clamp(44px,7vw,96px)] leading-[0.95]">Такой страницы нет</h1>
      <Link href="/" className="text-red underline underline-offset-4">
        На главную НСБ Чай
      </Link>
    </main>
  );
}
