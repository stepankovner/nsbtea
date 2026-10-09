import { NsbLogo } from "@/components/shop/NsbLogo";
import type { AdminOrder } from "@/lib/admin/orders";
import { formatDateTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Упаковочный лист: что положить в посылку и кому (SPEC 10.5). Без цен — его видит покупатель. */
export function PackingSlip({ order, size }: { order: AdminOrder; size: "a4" | "a6" }) {
  const small = size === "a6";
  return (
    <article
      data-size={size}
      className={cn("mx-auto bg-white text-black", small
          ? "w-full max-w-[105mm] p-[6mm] text-[11px] print:w-[105mm]"
          : // на экране телефона лист сжимается по ширине, при печати — ровно A4
            "w-full max-w-[210mm] p-[6mm] text-[14px] sm:p-[14mm] print:w-[210mm] print:p-[14mm]")}
    >
      <header className={cn("flex items-start justify-between border-b-2 border-black", small ? "pb-2" : "pb-4")}>
        <NsbLogo size={small ? 7 : 11} />
        <div className="text-right">
          <div className={cn("font-mono font-semibold", small ? "text-[14px]" : "text-[22px]")}>{order.number}</div>
          <div>{formatDateTime(order.created_at)}</div>
        </div>
      </header>

      <section className={cn("grid grid-cols-2 gap-3", small ? "py-2" : "py-5")}>
        <div>
          <div className="text-[0.8em] uppercase tracking-wide text-neutral-500">Получатель</div>
          <div className="font-semibold">{order.name}</div>
          <div>{formatPhone(order.phone)}</div>
        </div>
        <div>
          <div className="text-[0.8em] uppercase tracking-wide text-neutral-500">Доставка</div>
          <div className="font-semibold">{order.delivery_label}</div>
          <div>{order.delivery_summary}</div>
          {order.tracking_number ? <div>Трек: {order.tracking_number}</div> : null}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="w-6 py-1" aria-label="Собрано" />
            <th className="py-1">Товар</th>
            <th className="py-1">Вес / вид</th>
            <th className="py-1 text-right">Кол-во</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-300 align-top">
              <td className="py-1.5">
                <span className="inline-block size-3.5 border border-black" />
              </td>
              <td className="py-1.5 pr-2 font-medium">{item.name}</td>
              <td className="py-1.5 pr-2">{item.variant_label}</td>
              <td className="py-1.5 text-right font-semibold">{item.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {order.customer_comment ? (
        <section className={cn("border border-black", small ? "mt-2 p-1.5" : "mt-5 p-3")}>
          <div className="text-[0.8em] uppercase tracking-wide text-neutral-500">Комментарий покупателя</div>
          <div>{order.customer_comment}</div>
        </section>
      ) : null}
      {order.internal_comment ? (
        <section className={cn("bg-neutral-100", small ? "mt-2 p-1.5" : "mt-3 p-3")}>
          <div className="text-[0.8em] uppercase tracking-wide text-neutral-500">Заметка</div>
          <div>{order.internal_comment}</div>
        </section>
      ) : null}

      <footer className={cn("text-neutral-600", small ? "mt-3" : "mt-8")}>Спасибо за заказ! Вопросы — пишите нам в Telegram.</footer>
    </article>
  );
}
