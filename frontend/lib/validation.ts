/**
 * Проверки форм на витрине. Сервер проверяет всё повторно — здесь только быстрые подсказки,
 * тексты совпадают по смыслу с серверными.
 */

const PHONE_ERROR = "Нужен номер из 10–11 цифр";

/** Номер РФ → «+7XXXXXXXXXX» (как `normalize_phone` на сервере), иначе `null`. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }
  return null;
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

export type DeliveryMethod = "cdek_pvz" | "cdek_door" | "courier" | "pickup";

export interface DeliveryDraft {
  method: DeliveryMethod;
  cityCode?: number | null;
  cityName?: string | null;
  pvzCode?: string | null;
  pvzAddress?: string | null;
  address?: string | null;
  postalCode?: string | null;
  courierTime?: string | null;
}

export interface CheckoutForm {
  name: string;
  phone: string;
  email: string;
  delivery: DeliveryDraft;
  consentOffer: boolean;
  consentPd: boolean;
}

export type FormErrors = Partial<Record<string, string>>;

export function validateCheckout(form: CheckoutForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Укажите имя";
  if (!normalizePhone(form.phone)) errors.phone = PHONE_ERROR;
  if (!isValidEmail(form.email)) {
    errors.email = "Проверьте адрес почты — на него придут чек и статус заказа";
  }

  const d = form.delivery;
  const hasAddress = Boolean(d.address && d.address.trim());
  if (d.method === "cdek_pvz") {
    if (!d.cityCode) errors.delivery = "Выберите город доставки";
    else if (!d.pvzCode) errors.delivery = "Выберите пункт выдачи СДЭК";
  } else if (d.method === "cdek_door") {
    if (!d.cityCode) errors.delivery = "Выберите город доставки";
    else if (!hasAddress) errors.address = "Укажите адрес доставки";
  } else if (d.method === "courier" && !hasAddress) {
    errors.address = "Укажите адрес доставки";
  }

  if (!form.consentOffer) errors.consentOffer = "Нужно принять условия оферты";
  if (!form.consentPd) errors.consentPd = "Нужно согласие на обработку персональных данных";
  return errors;
}

export interface ApplicationForm {
  name: string;
  phone: string;
  telegram: string;
  consent: boolean;
}

export function validateApplication(form: ApplicationForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Укажите имя";
  const phone = form.phone.trim();
  const telegram = form.telegram.trim();
  if (!phone && !telegram) errors.contact = "Оставьте телефон или Telegram — одно из двух";
  else if (phone && !normalizePhone(phone)) errors.contact = PHONE_ERROR;
  if (!form.consent) errors.consent = "Нужно согласие на обработку персональных данных";
  return errors;
}
