# Модель данных

Это ориентир, а не окончательная схема: названия полей можно уточнять. Отступления фиксируются в `DECISIONS.md`.
Общее: у всех таблиц `id` (UUID v7), `created_at`, `updated_at`; деньги — `*_kop: int`, вес — `*_grams: int`; мягкое удаление — `archived_at`.

## Каталог

**Category** — `name`, `slug`, `parent_id`, `sort_order`, `cover_image`, `description`, `seo_title`, `seo_description`, `is_visible`.

**Product**
| Поле | Тип | Комментарий |
|---|---|---|
| `type` | enum `tea` \| `unit` | |
| `name`, `slug`, `category_id` | | |
| `short_description`, `description` | text / rich JSON | |
| `status` | enum `draft` \| `published` \| `hidden` | + `archived_at` |
| `price_per_gram_kop` | int, null | для `tea` |
| `unit_price_kop` | int, null | для `unit` |
| `stock_grams` / `stock_units` | int ≥ 0 | кэш, меняется только с `InventoryMovement` |
| `low_stock_threshold` | int, null | null → значение из настроек |
| `weight_presets` | int[] | подмножество глобальных пресетов, например `[25, 50, 100]` |
| `cake_weight_grams` | int, null | вес блина → вариант «Весь блин» |
| `cake_price_kop` | int, null | фиксированная цена блина (необязательно) |
| `custom_weight_enabled`, `custom_weight_min`, `custom_weight_step` | bool, int, int | |
| `weight_grams` | int, null | вес штучного товара для доставки |
| `attributes` | JSONB | тип, регион, фабрика, год сбора и прессовки, ферментация, форма, эффект |
| `flavor_tags` | m2m → `Tag` | вкусовые ноты (фильтры и похожие товары) |
| `brewing` | JSONB | `[{method, vessel, grams, volume_ml, temp_c, first_steep_sec, next_steep_sec, steeps}]` + `master_note` |
| `search_aliases` | text[] | |
| `is_new_until` | timestamptz | |
| `seo_title`, `seo_description` | | |

**ProductImage** — `product_id`, `s3_key`, `variants` (JSON с размерами), `alt`, `sort_order`.
**ProductRelation** — `product_id`, `related_id`, `kind` (`similar_pinned` \| `goes_with` \| `set_contains`), `sort_order`.
**Tag** — `name`, `slug`, `kind` (`flavor` \| `effect` \| …).

## Склад

**InventoryMovement** — `product_id`, `delta` (int, ± граммы или штуки), `reason` (`supply` \| `sale` \| `cancel` \| `refund` \| `adjustment` \| `writeoff`), `order_id`, `supply_id`, `comment`, `actor_id`, `balance_after`.
**Supply** (поставка) — `comment`, `actor_id`, `posted_at`; строки — это `InventoryMovement` с `supply_id`.
**StockAlertState** — `product_id`, `low_notified_at`, `out_notified_at` (против повторных уведомлений).

## Покупатели

**Customer** — `email` (unique, citext), `phone`, `name`, `telegram_id`, `telegram_username`, `marketing_consent`, `notes` (заметки владельца), `points_balance` (кэш), `first_paid_order_at`, `anonymized_at`.
**CustomerAddress** — `customer_id`, `kind` (`courier` \| `cdek_pvz` \| …), `data` (JSONB), `is_default`.
**LoginCode** — `email`, `code_hash`, `expires_at`, `attempts`.
**Favorite** — `customer_id`, `product_id`.
**Cart / CartItem** — `cart.customer_id` или `cart.session_id`; `item.product_id`, `grams` или `qty`, `variant_label`.

## Заказы и оплата

**Order**
- `number` — человекочитаемый, например `NSB-10042`; `customer_id`; контакты-снимок: `name`, `phone`, `email`
- `status` — см. SPEC 10.5; `status_history` → **OrderStatusChange** (`from`, `to`, `actor`, `comment`, `at`)
- суммы: `items_total_kop`, `discount_kop`, `promo_code_id`, `points_spent`, `points_to_earn`, `delivery_kop`, `total_kop`
- доставка: `delivery_method`, `delivery_data` (JSONB: адрес или ПВЗ, тариф СДЭК, удобное время), `tracking_number`
- `customer_comment`, `internal_comment`, `reserved_until`, `paid_at`, `completed_at`

**OrderItem** — снимок на момент заказа: `product_id`, `product_name`, `type`, `grams` или `qty`, `variant_label` («100 г», «Весь блин 357 г», «70 г»), `unit_price_kop`, `line_total_kop`, `discount_kop`, `applied_promotion_id`, `receipt_amount_kop` (сумма в чеке после распределения скидок и баллов).

**Payment** — `order_id`, `provider` = `tochka`, `payment_link_id`, `operation_id`, `payment_url`, `status`, `amount_kop`, `raw` (JSONB последнего ответа), `paid_at`.
**Refund** — `payment_id`, `amount_kop`, `items` (JSONB), `status`, `actor_id`, `reason`.
**WebhookEvent** — `provider`, `external_id` (unique — идемпотентность), `payload`, `processed_at`, `error`.

## Лояльность и акции

**PointsTransaction** — `customer_id`, `delta` (int), `kind` (`earn_pending` \| `earn` \| `spend_reserve` \| `spend` \| `release` \| `revert` \| `manual` \| `expire`), `order_id`, `comment`, `actor_id`, `balance_after`.
**Promotion** — `kind` (`thursday` \| `sale`), `percent` или `amount_kop`, `starts_at`, `ends_at`, `is_active`; связь с товарами и категориями.
**ThursdayPlan** — `date`, `percent`, товары (m2m) → воркер создаёт или активирует `Promotion` на дату.
**PromoCode** — `code` (unique, case-insensitive), `percent` или `amount_kop`, `min_order_kop`, `max_uses`, `max_uses_per_customer`, `first_order_only`, `applies_to_discounted`, `starts_at`, `ends_at`, товары и категории (необязательно).
**PromoCodeUsage** — `promo_code_id`, `customer_id`, `order_id`, `discount_kop`.

## Контент и заявки

**Page** — `slug`, `title`, `content` (rich JSON), `kind` (`page` \| `guide` \| `legal`), `is_published`, SEO-поля.
**HomeBlock** — `kind`, `data` (JSONB), `sort_order`, `is_visible`.
**Event** — `type` (`lecture` \| `ceremony` \| `rafting` \| `other`), `title`, `slug`, `starts_at`, `ends_at`, `place`, `price_text`, `seats_text`, `cover_image`, `description`, `is_published`.
**Application** — `type` (`wholesale` \| `event` \| `private_ceremony`), `event_id`, `name`, `phone`, `telegram`, `data` (JSONB), `status` (`new` \| `in_progress` \| `closed`), `admin_comment`.
**Article** [Ф2] — как `Page` + `tags`, `related_products`, `published_at`.

## Администрирование

**AdminUser** — `name`, `email`, `password_hash`, `role` (`owner` \| `staff`), `permissions` (text[]), `expires_at`, `revoked_at`, `telegram_chat_id`.
**AdminSession** — `admin_user_id`, `token_hash`, `expires_at`, `revoked_at`, `ip`, `user_agent`.
**AuditLog** — `actor_id`, `action`, `entity`, `entity_id`, `diff` (JSONB «было → стало»), `at`.
**Setting** — `key`, `value` (JSONB): лояльность, пресеты граммовок, пороги, доставка, коробки, налог, реквизиты, контакты.
**NotificationRecipient** — `chat_id`, `admin_user_id`, `events` (text[]).
**NotificationLog** — `channel`, `event`, `payload`, `status`, `error`.
