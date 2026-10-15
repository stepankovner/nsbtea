"""`python -m app.cli tochka-info` — проверка подключения эквайринга по данным самой Точки.

После одобрения заявки нужно правильно вписать в .env код клиента и торговую точку, а у точки
должны быть подключены чеки и нужные способы оплаты. Ошибку здесь иначе увидит только
покупатель — оплата просто не создастся.
"""

from typing import Any

from app.config import Settings
from app.integrations.tochka_setup import check_setup

BUSINESS = {
    "customerCode": "300000092",
    "customerType": "Business",
    "shortName": "ИП Булич Н. С.",
    "taxCode": "330500000000",
}
PERSONAL = {"customerCode": "1234567ab", "customerType": "Personal", "shortName": "Булич Н. С."}


def retailer(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "status": "REG",
        "isActive": True,
        "mcc": "5499",
        "rate": 2.8,
        "name": "НСБ ЧАЙ",
        "url": "https://nsbtea.ru",
        "merchantId": "200000000001111",
        "terminalId": "20001111",
        "paymentModes": ["sbp", "card"],
        "cashbox": "start",
    }
    data.update(overrides)
    return data


def settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "public_base_url": "https://nsbtea.ru",
        "tochka_customer_code": "300000092",
        "tochka_merchant_id": "200000000001111",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_everything_ready() -> None:
    report = check_setup([PERSONAL, BUSINESS], [retailer()], settings())
    assert report.problems == []
    assert report.warnings == []
    text = "\n".join(report.lines)
    assert "200000000001111" in text
    assert "ИП Булич Н. С." in text


def test_suggests_codes_when_env_is_empty() -> None:
    report = check_setup(
        [PERSONAL, BUSINESS],
        [retailer()],
        settings(tochka_customer_code=None, tochka_merchant_id=None),
    )
    assert report.env == {
        "TOCHKA_CUSTOMER_CODE": "300000092",
        "TOCHKA_MERCHANT_ID": "200000000001111",
    }
    assert any("TOCHKA_CUSTOMER_CODE" in p for p in report.problems)


def test_wrong_customer_code() -> None:
    report = check_setup([BUSINESS], [retailer()], settings(tochka_customer_code="1234567ab"))
    assert any("TOCHKA_CUSTOMER_CODE" in p and "300000092" in p for p in report.problems)


def test_key_without_business_account() -> None:
    report = check_setup([PERSONAL], [retailer()], settings())
    assert any("ИП" in p for p in report.problems), report.problems


def test_no_retailers_means_application_not_approved() -> None:
    report = check_setup([BUSINESS], [], settings())
    assert any("заявка" in p for p in report.problems), report.problems


def test_several_retailers_need_merchant_id_and_the_site_one_is_suggested() -> None:
    showcase = retailer(name="Витрина", url="https://nsb.tochka.site", merchantId="200000000000777")
    report = check_setup([BUSINESS], [showcase, retailer()], settings(tochka_merchant_id=None))
    assert any("TOCHKA_MERCHANT_ID" in p for p in report.problems)
    assert report.env["TOCHKA_MERCHANT_ID"] == "200000000001111"  # точка с адресом сайта


def test_unknown_merchant_id() -> None:
    report = check_setup([BUSINESS], [retailer()], settings(tochka_merchant_id="200000000009999"))
    assert any("200000000009999" in p for p in report.problems)


def test_retailer_not_ready() -> None:
    report = check_setup([BUSINESS], [retailer(status="NEW", isActive=False)], settings())
    assert any("не готова" in p for p in report.problems), report.problems


def test_receipts_not_connected() -> None:
    report = check_setup([BUSINESS], [retailer(cashbox=None)], settings())
    assert any("чек" in p.lower() for p in report.problems), report.problems


def test_payment_mode_not_available_at_retailer() -> None:
    report = check_setup(
        [BUSINESS], [retailer(paymentModes=["sbp"])], settings(tochka_payment_modes=["card", "sbp"])
    )
    assert any("card" in p for p in report.problems), report.problems
    assert report.env["TOCHKA_PAYMENT_MODES"] == "sbp"


def test_site_address_differs_from_bank_record() -> None:
    report = check_setup([BUSINESS], [retailer(url="https://old-shop.ru")], settings())
    assert report.problems == []
    assert any("old-shop.ru" in w for w in report.warnings)


def test_www_is_the_same_site() -> None:
    report = check_setup([BUSINESS], [retailer(url="https://www.nsbtea.ru/")], settings())
    assert report.warnings == []
