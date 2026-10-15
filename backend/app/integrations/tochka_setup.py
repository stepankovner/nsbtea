"""Проверка подключения интернет-эквайринга по данным самой Точки (`python -m app.cli tochka-info`).

После одобрения заявки в .env нужно вписать код клиента и торговую точку, а у точки должны быть
подключены чеки и нужные способы оплаты. Ошибку здесь иначе увидит только покупатель:
оплата просто не создастся. Чистая функция — без сети, на вход ответы API.
"""

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

from app.config import Settings


@dataclass(slots=True)
class SetupReport:
    lines: list[str] = field(default_factory=list)  # что нашли
    problems: list[str] = field(default_factory=list)  # без исправления оплата не заработает
    warnings: list[str] = field(default_factory=list)  # стоит проверить
    env: dict[str, str] = field(default_factory=dict)  # что вписать в .env


def _host(url: str | None) -> str:
    host = urlsplit(url or "").hostname or ""
    return host.removeprefix("www.")


def _describe(r: dict[str, Any]) -> str:
    state = "активна" if r.get("isActive") else "не активна"
    modes = ", ".join(r.get("paymentModes") or []) or "—"
    return (
        f"«{r.get('name', '?')}» — merchantId {r.get('merchantId')}, статус {r.get('status')}, "
        f"{state}, сайт {r.get('url') or '—'}, оплата: {modes}, чеки: {r.get('cashbox') or 'нет'}"
    )


def _check_customer(
    customers: list[dict[str, Any]], settings: Settings, report: SetupReport
) -> None:
    business = [c for c in customers if c.get("customerType") == "Business"]
    if not business:
        report.problems.append(
            "Точка не вернула счёт ИП (customerType=Business): ключ выпущен не из интернет-банка "
            "ИП или у него нет права ReadCustomerData."
        )
        return
    for c in business:
        report.lines.append(
            f"Клиент: {c.get('shortName') or c.get('fullName')} — {c['customerCode']}"
        )
    codes = [str(c["customerCode"]) for c in business]
    if settings.tochka_customer_code in codes:
        return
    if len(codes) == 1:
        report.env["TOCHKA_CUSTOMER_CODE"] = codes[0]
    if settings.tochka_customer_code:
        report.problems.append(
            f"TOCHKA_CUSTOMER_CODE={settings.tochka_customer_code} не найден у Точки — "
            f"нужен {' или '.join(codes)}."
        )
    else:
        report.problems.append(f"TOCHKA_CUSTOMER_CODE не задан — впишите {' или '.join(codes)}.")


def _choose_retailer(
    retailers: list[dict[str, Any]], settings: Settings, report: SetupReport
) -> dict[str, Any] | None:
    if settings.tochka_merchant_id:
        chosen = next(
            (r for r in retailers if str(r.get("merchantId")) == settings.tochka_merchant_id),
            None,
        )
        if chosen is None:
            report.problems.append(
                f"TOCHKA_MERCHANT_ID={settings.tochka_merchant_id} нет среди торговых точек."
            )
        return chosen
    if len(retailers) == 1:
        # Точка советует передавать merchantId всегда — тогда новая точка ничего не сломает
        report.env["TOCHKA_MERCHANT_ID"] = str(retailers[0].get("merchantId"))
        return retailers[0]
    site = _host(settings.public_base_url)
    same_site = [r for r in retailers if _host(r.get("url")) == site]
    if len(same_site) == 1:
        merchant_id = str(same_site[0].get("merchantId"))
        report.env["TOCHKA_MERCHANT_ID"] = merchant_id
        report.problems.append(
            f"Торговых точек несколько — задайте TOCHKA_MERCHANT_ID={merchant_id} "
            f"(точка сайта {site})."
        )
        return same_site[0]
    report.problems.append(
        "Торговых точек несколько — задайте TOCHKA_MERCHANT_ID: "
        "выберите точку этого сайта из списка."
    )
    return None


def check_setup(
    customers: list[dict[str, Any]], retailers: list[dict[str, Any]], settings: Settings
) -> SetupReport:
    report = SetupReport()
    _check_customer(customers, settings, report)

    if not retailers:
        report.problems.append(
            "Торговых точек нет — заявка на интернет-эквайринг ещё не одобрена (или не подана)."
        )
        return report
    report.lines.append(f"Торговые точки ({len(retailers)}):")
    report.lines.extend(f"  {_describe(r)}" for r in retailers)

    chosen = _choose_retailer(retailers, settings, report)
    if chosen is None:
        return report
    name = chosen.get("name", "?")
    if chosen.get("status") != "REG" or not chosen.get("isActive"):
        report.problems.append(
            f"Торговая точка «{name}» ещё не готова к оплатам (статус {chosen.get('status')}, "
            f"{'активна' if chosen.get('isActive') else 'не активна'}) — дождитесь подключения."
        )
    if not chosen.get("cashbox"):
        report.problems.append(
            f"К торговой точке «{name}» не подключены чеки (облачная касса или сервис «Чеки»): "
            "сайт создаёт оплату с чеком, без кассы она не пройдёт."
        )
    available = [str(mode) for mode in chosen.get("paymentModes") or []]
    wanted = [str(mode) for mode in settings.tochka_payment_modes]
    missing = [mode for mode in wanted if mode not in available]
    if missing:
        report.problems.append(
            f"У торговой точки «{name}» не подключено: {', '.join(missing)} — "
            "уберите из TOCHKA_PAYMENT_MODES или подключите в банке."
        )
        usable = [mode for mode in wanted if mode in available]
        if usable:
            report.env["TOCHKA_PAYMENT_MODES"] = ",".join(usable)
    bank_site = _host(chosen.get("url"))
    if bank_site and bank_site != _host(settings.public_base_url):
        report.warnings.append(
            f"В банке у торговой точки указан сайт {chosen.get('url')}, а сайт работает на "
            f"{settings.public_base_url} — попросите Точку поменять адрес."
        )
    return report
