"""Страница «оплаты» для разработки и e2e-тестов (только при TOCHKA_MODE=fake, не в боевом)."""

from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

from app.api.deps import Db, Deps
from app.domain.errors import NotFoundError
from app.domain.money import format_rub
from app.integrations.payments import FakePaymentGateway
from app.models import Payment
from app.services import orders as order_service
from app.services import payments

router = APIRouter(prefix="/dev", include_in_schema=False)


def _gateway(container: Deps) -> FakePaymentGateway:
    if not isinstance(container.payments, FakePaymentGateway) or container.settings.is_production:
        raise NotFoundError("Страница не найдена")
    return container.payments


@router.get("/fake-pay/{operation_id}", response_class=HTMLResponse)
async def fake_pay_page(operation_id: str, container: Deps) -> HTMLResponse:
    gateway = _gateway(container)
    payment = gateway.payments.get(operation_id)
    if payment is None:
        raise NotFoundError("Платёж не найден")
    request = payment.request
    rows = "".join(f"<li>{escape(i.name)} — {format_rub(i.amount_kop)}</li>" for i in request.items)
    html = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Тестовая оплата</title></head>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px;
background:#F1EDE4">
<h1>Тестовая оплата</h1>
<p>Это заглушка банка для разработки. Деньги не списываются.</p>
<p><b>{escape(request.purpose)}</b></p><ul>{rows}</ul>
<p style="font-size:22px">К оплате: <b>{format_rub(request.amount_kop)}</b></p>
<form method="post" action="/api/dev/fake-pay/{escape(operation_id)}/pay">
<button style="padding:14px 24px;background:#1D231B;color:#fff;border:0;
border-radius:999px;font-size:16px" data-testid="fake-pay">Оплатить</button></form>
<p><a href="{escape(request.fail_redirect_url)}">Отказаться от оплаты</a></p>
</body></html>"""
    return HTMLResponse(html)


@router.post("/fake-pay/{operation_id}/pay")
async def fake_pay(operation_id: str, db: Db, container: Deps) -> RedirectResponse:
    gateway = _gateway(container)
    payment = gateway.payments.get(operation_id)
    if payment is None:
        raise NotFoundError("Платёж не найден")
    gateway.mark_paid(operation_id)
    stored = await db.scalar(select(Payment).where(Payment.operation_id == operation_id))
    if stored is not None:
        order = await order_service.lock_order(db, stored.order_id)
        await payments.refresh_order_payment(db, container, order)
    return RedirectResponse(payment.request.redirect_url, status_code=303)
