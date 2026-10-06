# Интеграции: справка для разработки

Сверено с официальными спецификациями и живыми запросами в песочницы (октябрь 2026).
Пометка **НЕ ПОДТВЕРЖДЕНО** — то, что нужно проверить на боевом контуре.

## Точка Банк — интернет-эквайринг

- Боевой адрес: `https://enter.tochka.com/uapi`, песочница: `https://enter.tochka.com/sandbox/v2`.
- Авторизация: `Authorization: Bearer <JWT>`. В песочнице токен — `sandbox.jwt.token`,
  `customerCode=1234567ab`, `merchantId=200000000001097`. Ответы песочницы захардкожены,
  оплатить ссылку в песочнице нельзя, вебхуки не работают.
- JWT выпускается в интернет-банке: «Сервисы → Интеграции и API → Создать JWT-ключ»;
  рядом показан `client_id` (нужен для регистрации вебхука). Права:
  `MakeAcquiringOperation`, `ReadAcquiringData`, `ReadCustomerData`, `ManageWebhookData`.
- `customerCode`: `GET /open-banking/v1.0/customers` → запись с `customerType=Business`.
- `merchantId`: `GET /acquiring/v1.0/retailers?customerCode=…` → `status=REG`, `isActive=true`.

### Платёжная ссылка с чеком
`POST /acquiring/v1.0/payments_with_receipt`, тело обёрнуто в `Data`:
`customerCode`, `amount` (рубли, число), `purpose` (≤140), `redirectUrl`, `failRedirectUrl`,
`paymentMode` (`card`, `sbp`, `tinkoff`, `dolyame`), `merchantId`, `ttl` (минуты),
`paymentLinkId` (≤45, уникальный), `taxSystemCode` (`osn`, `usn_income`,
`usn_income_outcome`, `esn`, `patent`), `Client{email*, name, phone}`,
`Items[]{name, amount (цена за единицу, рубли), quantity, vatType, paymentMethod
(full_payment|full_prepayment), paymentObject (goods|service|work), measure ("шт."|"г."…)}`.
`vatType`: `none`, `vat0`, `vat5`, `vat7`, `vat10`, `vat22`, `vat105`, `vat107`, `vat110`, `vat122`
(`vat20`/`vat120` больше не принимаются).
Ответ: `Data.operationId`, `Data.paymentLink`, `Data.status=CREATED`.

### Статус и возврат
- `GET /acquiring/v1.0/payments/{operationId}` → `Data.Operation[]` (массив!), поле `status`:
  `CREATED`, `APPROVED`, `ON-REFUND`, `REFUNDED`, `EXPIRED`, `REFUNDED_PARTIALLY`,
  `AUTHORIZED`, `WAIT_FULL_PAYMENT`.
- Возврат: `POST /acquiring/v1.0/payments/{operationId}/refund` с `{"Data":{"amount": 100.00}}`;
  только для `APPROVED`; частичный разрешён; о возврате вебхук не приходит.
- **НЕ ПОДТВЕРЖДЕНО:** формирует ли фискальный партнёр чек возврата автоматически.

### Вебхук `acquiringInternetPayment`
- Регистрация: `PUT /webhook/v1.0/{client_id}` с `{"webhooksList":["acquiringInternetPayment"],
  "url":"https://nsbtea.ru/api/webhooks/tochka"}` (без `Data`). Только HTTPS/443; при
  регистрации Точка шлёт тестовый вебхук и ждёт 200. Не-200 повторяется 30 раз раз в 10 с.
- Тело — строка JWT (`Content-Type: text/plain`), подпись RS256, публичный ключ (JWK):
  `https://enter.tochka.com/doc/openapi/static/keys/public`.
- Поля: `webhookType`, `customerCode`, `amount` (**строка**, `"0.33"`), `paymentType`,
  `operationId`, `merchantId`, `purpose`, `status` (`APPROVED`/`AUTHORIZED`), `paymentLinkId`.
- По ТЗ после вебхука статус всё равно перепроверяется запросом `GET payments/{operationId}`.

## СДЭК API v2

- Боевой: `https://api.cdek.ru/v2`, тестовый: `https://api.edu.cdek.ru/v2`.
- Публичный тестовый аккаунт: `client_id=wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP`,
  `client_secret=RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5`. Боевые ключи: lk.cdek.ru → «Интеграция».
- Токен: `POST /v2/oauth/token` (form: `grant_type=client_credentials`, `client_id`,
  `client_secret`) → `access_token`, `expires_in≈3600`.
- Расчёт: `POST /v2/calculator/tariff` (`tariff_code`, `from_location{code}`, `to_location{code|address}`,
  `packages[{weight (г), length, width, height (см)}]`) → `delivery_sum`, `total_sum`, `period_min/max`.
  `POST /v2/calculator/tarifflist` → `tariff_codes[]` (без `total_sum`).
- Тарифы интернет-магазина: **136** посылка склад-склад (до ПВЗ), **137** склад-дверь,
  **368** склад-постамат, 234/233 — экономичные. Проверить доступность для договора:
  `GET /v2/calculator/alltariffs`.
- ПВЗ: `GET /v2/deliverypoints?city_code=…&type=PVZ` — ответ-массив, пагинация в заголовках
  `x-total-elements`, `x-total-pages`, `x-current-page`.
- Города: `GET /v2/location/suggest/cities?name=…&country_code=RU`. **Владимир — код 94**
  (проверено на тестовом контуре).

### Виджет ПВЗ (`@cdek-it/widget@3`)
- CDN: `https://cdn.jsdelivr.net/npm/@cdek-it/widget@3`, глобальный `window.CDEKWidget`.
- Нужен ключ Яндекс Карт («JavaScript API и HTTP Геокодер», ограничение по HTTP Referrer).
- `servicePath` — наш прокси `/api/delivery/cdek/service`:
  - `action=offices` (GET) → `GET /deliverypoints?<параметры>`, пробросить заголовки `x-*`;
  - `action=calculate` (POST JSON) → `POST /calculator/tarifflist`;
  - иначе — 400 `{"message":"Unknown action"}`.
- `onChoose(mode: 'door'|'office', tariff, target)`: для ПВЗ `target.code` — код пункта,
  `target.city_code` — код города; для двери — объект геокодера с `formatted`, `postal_code`.
