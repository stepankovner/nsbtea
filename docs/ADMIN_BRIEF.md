# Бриф для разработки раздела админки «НСБ Чай»

Ты пишешь раздел админки интернет-магазина китайского чая. Пользователь админки — владелец магазина,
НЕ программист, работает в основном С ТЕЛЕФОНА. Главное требование заказчика: админка должна быть
максимально понятной неопытному человеку. Качество важнее скорости.

## Где что лежит
- Репозиторий: текущая рабочая папка (git worktree). Фронтенд — `frontend/` (Next.js 16 App Router, React 19,
  TypeScript strict, Tailwind 4, shadcn/ui, TanStack Query 5, Vitest + Testing Library).
- Перед началом: `cd frontend && pnpm install --frozen-lockfile` (интернет есть).
- ТЗ: `docs/SPEC.md` — раздел 10 (админка) обязателен к прочтению целиком, плюс разделы про твою область.
  `CLAUDE.md` — жёсткие правила. `docs/DESIGN.md` — принципы админки.
- Backend уже готов. Типы API: `frontend/lib/api/schema.d.ts` (сгенерированы из OpenAPI; руками не править
  и не дублировать — используй `Schemas["ИмяСхемы"]` из `@/lib/admin/client`). Если непонятна логика —
  читай backend: `backend/app/api/admin/*.py`, `backend/app/services/*.py`, `backend/app/domain/*.py`.
  Backend менять НЕЛЬЗЯ. Если чего-то критично не хватает в API — опиши это в отчёте.

## ОБРАЗЕЦ — изучи до начала работы
Раздел «Заказы» сделан как эталон. Повторяй его стиль и приёмы:
- `frontend/lib/admin/orders.ts` — функции API раздела (`ordersApi`) + ключи запросов (`orderKeys`).
- `frontend/components/admin/orders/OrdersList.tsx`, `OrderDetail.tsx`, `PackingSlip.tsx` и их тесты `*.test.tsx`.
- `frontend/app/admin/(app)/orders/page.tsx`, `.../orders/[id]/page.tsx` — страницы (тонкие обёртки).
- Тест-обёртка: `frontend/tests/admin.tsx` → `renderWithAdmin(ui, { owner, permissions })`.

Общие компоненты (используй, НЕ переписывай и НЕ меняй их файлы):
- `components/admin/page.tsx`: `PageHeader` (заголовок, описание, «назад», главные действия), `EmptyState`,
  `StatusBadge` (статус — всегда текстом и цветом), `QueryState` (загрузка/ошибка запроса), `SectionCard`.
- `components/admin/Field.tsx` — поле с подписью, подсказкой «?» (`hint`) и ошибкой; `components/admin/Hint.tsx`.
- `components/admin/MoneyField.tsx` — сумма в рублях (хранится в КОПЕЙКАХ, правило 1 — никаких float).
- `components/admin/ConfirmAction.tsx` — опасное действие с окном «что произойдёт» + подтверждение.
- `components/admin/ProductPicker.tsx` — выбор товаров (поиск, список выбранных, max).
- `components/admin/ImageUpload.tsx` — одна картинка (камера/галерея), `lib/admin/media.ts` (`uploadMedia`,
  `uploadProductImages`).
- `components/admin/RichTextEditor.tsx` — визуальный редактор (TipTap) с карточкой товара; `lib/admin/richtext.ts`.
- `lib/admin/autosave.ts` — `useAutosave(value, save, {delay})` + `AUTOSAVE_LABELS`.
- `components/admin/session.tsx` — `useAdmin()` → `{ user, isOwner, can(permission) }`.
- `components/ui/*` — shadcn (Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Dialog, AlertDialog,
  Sheet, Tabs, Table, Badge, Tooltip, Popover, DropdownMenu, Command, Skeleton, Card, Progress, ScrollArea).
  Кнопки и поля уже крупные (≥44px). `toast` из `sonner` — короткие уведомления «Сохранено».
- `lib/format.ts` — `formatRub`, `kopToRubInput`, `rubToKop`, `formatGrams`, `formatQty`, `formatDate`,
  `formatDateTime`, `formatDayTime`, `formatPhone`, `plural`. `lib/utils.ts` — `cn`.
- Навигация уже настроена в `lib/admin/nav.ts` (не меняй) — пути разделов см. ниже.

## Правила интерфейса (обязательно)
1. Все тексты — по-русски, простыми словами, без жаргона («Остаток», «Скрыть с сайта», «Убрать в архив»).
2. У каждого неочевидного поля — подсказка «?» (`hint`) С ПРИМЕРОМ.
3. Mobile-first: каждый экран полноценно работает на ширине 375px (одна колонка, крупные кнопки, без
   горизонтального скролла страницы; таблицы на телефоне — карточками/списком). На ноутбуке (1440px) —
   можно две колонки.
4. Главное действие экрана — заметной кнопкой в `PageHeader` (на телефоне — во всю ширину или видна сразу).
5. Пустые состояния с подсказкой, что сделать (`EmptyState`).
6. Удаление — только «в архив» с возможностью восстановить; опасные действия — через `ConfirmAction`
   с объяснением последствий.
7. Ошибки — текстом сервера (он уже по-русски и понятный): `errorMessage(e)` из `@/lib/api/errors`;
   ошибки полей — `fieldErrors(e)`.
8. Длинные формы — шагами или секциями. Сохранение — явной кнопкой; черновики — автосохранением, где сказано.
9. Деньги вводятся в рублях (`MoneyField`), передаются в копейках. Вес — целые граммы.
10. После изменений — `toast.success("…")` и обновление кэша TanStack Query (`setQueryData`/`invalidateQueries`).
11. Права: экраны и кнопки, недоступные сотруднику, — скрыть (`useAdmin().can(...)`, `isOwner`).
12. Доступность: у полей label, у иконок-кнопок `aria-label`, порядок фокуса логичный.

## Процесс — СТРОГО TDD (требование заказчика)
1. Сначала пишешь тесты (Vitest + Testing Library, моки API через `vi.mock("@/lib/admin/<раздел>")`, как в
   тестах заказов). Тесты проверяют поведение с точки зрения пользователя (роли, подписи, вызовы API с
   правильными данными, сообщения), а не детали реализации.
2. Запускаешь — тесты должны падать. Коммитишь: `git commit -m "test(admin): <раздел> … (до реализации)"`.
3. Пишешь реализацию, НЕ подгоняя тесты под код. Если тест оказался ошибочным (противоречит backend/ТЗ) —
   исправь тест отдельным коммитом с объяснением в сообщении, ДО того как писать код под него.
4. Проверки перед финальным коммитом (все должны проходить):
   `cd frontend && pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm lint`
   (`pnpm lint` — 0 ошибок; React-линтер запрещает setState синхронно в useEffect и чтение ref при
   рендере — используй производное состояние, как в образце).
5. Коммит реализации: `git commit -m "feat(admin): <раздел> …"`. Каждое сообщение коммита заканчивай строками:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01DD2oSyy1UKfKE3mes6j1PH
   ```
   НЕ указывай в коммитах и коде название модели. НЕ делай `git push`. Не создавай PR.

## Границы файлов (чтобы не конфликтовать с другими разработчиками, работающими параллельно)
Создавай и меняй ТОЛЬКО файлы своего раздела:
- `frontend/lib/admin/<твои-модули>.ts`
- `frontend/components/admin/<твой-раздел>/**`
- `frontend/app/admin/(app)/<твои-пути>/**`
Общие файлы (перечислены выше, `lib/api/*`, `tests/*`, `components/ui/*`, `app/globals.css`, `package.json`)
НЕ трогай. Нужна новая зависимость — не ставь, опиши в отчёте. Нужен общий компонент — сделай его внутри
своей папки.

## Отчёт в конце (кратко, по-русски)
- Что сделано (экраны, пути).
- Список коммитов (git log --oneline для своих коммитов).
- Результаты проверок (число тестов, tsc, lint).
- Чего не хватает в API / что не сделано и почему / на что обратить внимание.
