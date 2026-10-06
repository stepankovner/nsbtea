"""Вход в админку: пароль + код в Telegram, сессии, приглашения сотрудников (SPEC 10.9)."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.core.security import (
    MIN_PASSWORD_LENGTH,
    hash_password,
    hash_token,
    new_human_code,
    new_numeric_code,
    new_token,
    tokens_equal,
    verify_password,
)
from app.domain.contacts import normalize_email
from app.domain.errors import (
    AuthRequiredError,
    ConflictError,
    DomainError,
    InvalidCodeError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models import AdminChallenge, AdminSession, AdminUser, NotificationRecipient
from app.models.admin import (
    PERMISSION_LABELS,
    AdminPermission,
    AdminRole,
    ChallengePurpose,
)
from app.models.system import NotificationEvent
from app.services import audit
from app.services.outbox import enqueue_telegram

LOGIN_LIMIT = 10
LOGIN_WINDOW_SECONDS = 15 * 60
CODE_TTL = timedelta(minutes=10)
RESET_TTL = timedelta(minutes=15)
LINK_TTL = timedelta(minutes=30)
INVITE_TTL = timedelta(days=7)
MAX_CODE_ATTEMPTS = 5

INVALID_CREDENTIALS = "Неверная почта или пароль"


@dataclass(frozen=True, slots=True)
class SessionTokens:
    token: str
    csrf_token: str
    user: AdminUser
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class LoginResult:
    tokens: SessionTokens | None = None
    challenge_id: uuid.UUID | None = None


@dataclass(frozen=True, slots=True)
class AdminContext:
    user: AdminUser
    session: AdminSession

    def require(self, permission: AdminPermission) -> None:
        if not self.user.has_permission(permission):
            raise PermissionDeniedError(f"Нет доступа к разделу «{PERMISSION_LABELS[permission]}»")

    def require_owner(self) -> None:
        if not self.user.is_owner:
            raise PermissionDeniedError("Этот раздел доступен только владельцу")


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise DomainError(
            f"Пароль должен быть не короче {MIN_PASSWORD_LENGTH} символов", field="password"
        )


async def create_owner(db: AsyncSession, *, email: str, name: str, password: str) -> AdminUser:
    validate_password(password)
    email = normalize_email(email)
    if await db.scalar(select(AdminUser).where(AdminUser.email == email)):
        raise ConflictError("Сотрудник с такой почтой уже есть")
    user = AdminUser(
        email=email,
        name=name.strip(),
        password_hash=hash_password(password),
        role=AdminRole.OWNER.value,
    )
    db.add(user)
    await db.flush()
    return user


def _inactive_reason(user: AdminUser, now: datetime) -> str | None:
    if user.revoked_at is not None:
        return "Доступ отозван владельцем"
    if user.expires_at is not None and user.expires_at <= now:
        return "Срок доступа истёк — попросите владельца продлить"
    return None


async def _open_session(
    db: AsyncSession,
    container: Container,
    user: AdminUser,
    *,
    ip: str | None,
    user_agent: str | None,
) -> SessionTokens:
    now = container.clock.now()
    token = new_token()
    csrf = new_token(24)
    expires_at = now + timedelta(days=container.settings.admin_session_days)
    if user.expires_at is not None:
        expires_at = min(expires_at, user.expires_at)
    db.add(
        AdminSession(
            admin_user_id=user.id,
            token_hash=hash_token(token, container.secret),
            csrf_token=csrf,
            expires_at=expires_at,
            last_seen_at=now,
            ip=ip,
            user_agent=(user_agent or "")[:400] or None,
        )
    )
    user.last_login_at = now
    user.failed_logins = 0
    await audit.record(
        db,
        user,
        action="auth.login",
        entity="admin_user",
        entity_id=user.id,
        summary="Вход в админку",
    )
    return SessionTokens(token=token, csrf_token=csrf, user=user, expires_at=expires_at)


async def _create_challenge(
    db: AsyncSession,
    container: Container,
    user: AdminUser,
    purpose: ChallengePurpose,
    code: str,
    ttl: timedelta,
) -> AdminChallenge:
    challenge = AdminChallenge(
        admin_user_id=user.id,
        purpose=purpose.value,
        code_hash=hash_token(code, container.secret),
        expires_at=container.clock.now() + ttl,
    )
    db.add(challenge)
    await db.flush()
    return challenge


async def login(
    db: AsyncSession,
    container: Container,
    *,
    email: str,
    password: str,
    ip: str | None,
    user_agent: str | None,
) -> LoginResult:
    email = email.strip().lower()
    await container.rate_limiter.hit(
        f"admin-login:{ip}:{email}", limit=LOGIN_LIMIT, window_seconds=LOGIN_WINDOW_SECONDS
    )
    user = await db.scalar(select(AdminUser).where(AdminUser.email == email))
    if user is None or not user.password_hash or not verify_password(user.password_hash, password):
        if user is not None:
            user.failed_logins += 1
        raise AuthRequiredError(INVALID_CREDENTIALS)
    reason = _inactive_reason(user, container.clock.now())
    if reason:
        raise AuthRequiredError(reason)

    if user.telegram_chat_id is None:
        tokens = await _open_session(db, container, user, ip=ip, user_agent=user_agent)
        return LoginResult(tokens=tokens)

    code = new_numeric_code()
    challenge = await _create_challenge(
        db, container, user, ChallengePurpose.LOGIN_2FA, code, CODE_TTL
    )
    enqueue_telegram(
        db,
        chat_id=user.telegram_chat_id,
        event="admin_2fa",
        text=(
            f"Код для входа в админку НСБ Чай: <b>{code}</b>\n"
            "Код действует 10 минут. Никому его не сообщайте.\n"
            "Если это были не вы — смените пароль."
        ),
    )
    await container.kicker.kick("deliver_outbox")
    return LoginResult(challenge_id=challenge.id)


async def _consume_challenge(
    db: AsyncSession,
    container: Container,
    challenge: AdminChallenge | None,
    code: str,
) -> AdminChallenge:
    now = container.clock.now()
    if challenge is None or challenge.consumed_at is not None:
        raise InvalidCodeError("Код больше не действует — войдите заново")
    if challenge.attempts >= MAX_CODE_ATTEMPTS:
        raise InvalidCodeError(
            "Слишком много неверных попыток — войдите заново", code="code_burned"
        )
    if challenge.expires_at <= now:
        raise InvalidCodeError(
            "Код устарел — войдите заново и запросите новый", code="code_expired"
        )
    if not tokens_equal(challenge.code_hash, hash_token(code.strip(), container.secret)):
        challenge.attempts += 1
        left = MAX_CODE_ATTEMPTS - challenge.attempts
        await db.commit()  # счётчик попыток должен сохраниться, даже если запрос завершится ошибкой
        if left <= 0:
            raise InvalidCodeError(
                "Слишком много неверных попыток — войдите заново", code="code_burned"
            )
        raise InvalidCodeError(f"Неверный код. Осталось попыток: {left}", code="code_invalid")
    challenge.consumed_at = now
    return challenge


async def verify_two_factor(
    db: AsyncSession,
    container: Container,
    *,
    challenge_id: uuid.UUID,
    code: str,
    ip: str | None,
    user_agent: str | None,
) -> SessionTokens:
    challenge = await db.get(AdminChallenge, challenge_id, with_for_update=True)
    if challenge is not None and challenge.purpose != ChallengePurpose.LOGIN_2FA.value:
        challenge = None
    challenge = await _consume_challenge(db, container, challenge, code)
    user = await db.get(AdminUser, challenge.admin_user_id)
    assert user is not None
    reason = _inactive_reason(user, container.clock.now())
    if reason:
        raise AuthRequiredError(reason)
    return await _open_session(db, container, user, ip=ip, user_agent=user_agent)


async def resolve_session(db: AsyncSession, container: Container, token: str) -> AdminContext:
    session = await db.scalar(
        select(AdminSession).where(AdminSession.token_hash == hash_token(token, container.secret))
    )
    now = container.clock.now()
    if session is None or session.revoked_at is not None:
        user = session.admin_user if session else None
        if user is not None and user.revoked_at is not None:
            raise AuthRequiredError("Доступ отозван владельцем")
        raise AuthRequiredError("Войдите в админку")
    if session.expires_at <= now:
        raise AuthRequiredError("Сессия истекла — войдите заново")
    reason = _inactive_reason(session.admin_user, now)
    if reason:
        raise AuthRequiredError(reason)
    if session.last_seen_at is None or now - session.last_seen_at > timedelta(minutes=5):
        session.last_seen_at = now
    return AdminContext(user=session.admin_user, session=session)


def check_csrf(context: AdminContext, header_value: str | None) -> None:
    if not header_value or not tokens_equal(context.session.csrf_token, header_value):
        raise PermissionDeniedError("Сессия устарела — обновите страницу и повторите действие")


async def logout(db: AsyncSession, container: Container, context: AdminContext) -> None:
    context.session.revoked_at = container.clock.now()


async def start_password_reset(db: AsyncSession, container: Container, *, email: str) -> None:
    email = email.strip().lower()
    await container.rate_limiter.hit(f"admin-reset:{email}", limit=5, window_seconds=3600)
    user = await db.scalar(select(AdminUser).where(AdminUser.email == email))
    if user is None or user.telegram_chat_id is None:
        return
    if _inactive_reason(user, container.clock.now()):
        return
    code = new_numeric_code()
    await _create_challenge(db, container, user, ChallengePurpose.PASSWORD_RESET, code, RESET_TTL)
    enqueue_telegram(
        db,
        chat_id=user.telegram_chat_id,
        event="admin_password_reset",
        text=(
            f"Код для смены пароля в админке НСБ Чай: <b>{code}</b>\n"
            "Код действует 15 минут. Если вы не просили сменить пароль — ничего не делайте."
        ),
    )
    await container.kicker.kick("deliver_outbox")


async def reset_password(
    db: AsyncSession, container: Container, *, email: str, code: str, new_password: str
) -> None:
    validate_password(new_password)
    email = email.strip().lower()
    await container.rate_limiter.hit(f"admin-reset-verify:{email}", limit=10, window_seconds=3600)
    user = await db.scalar(select(AdminUser).where(AdminUser.email == email))
    challenge = None
    if user is not None:
        challenge = await db.scalar(
            select(AdminChallenge)
            .where(
                AdminChallenge.admin_user_id == user.id,
                AdminChallenge.purpose == ChallengePurpose.PASSWORD_RESET.value,
                AdminChallenge.consumed_at.is_(None),
            )
            .order_by(AdminChallenge.created_at.desc())
            .limit(1)
            .with_for_update()
        )
    await _consume_challenge(db, container, challenge, code)
    assert user is not None
    user.password_hash = hash_password(new_password)
    await _revoke_sessions(db, container, user.id)
    await audit.record(
        db,
        user,
        action="auth.password_reset",
        entity="admin_user",
        entity_id=user.id,
        summary="Пароль изменён через Telegram",
    )


async def _revoke_sessions(db: AsyncSession, container: Container, user_id: uuid.UUID) -> None:
    await db.execute(
        update(AdminSession)
        .where(AdminSession.admin_user_id == user_id, AdminSession.revoked_at.is_(None))
        .values(revoked_at=container.clock.now())
    )


def _clean_permissions(permissions: list[str]) -> list[str]:
    valid = {p.value for p in AdminPermission}
    unknown = [p for p in permissions if p not in valid]
    if unknown:
        raise DomainError("Неизвестный раздел доступа", field="permissions")
    if not permissions:
        raise DomainError("Отметьте хотя бы один раздел", field="permissions")
    return sorted(set(permissions))


def invite_url(container: Container, token: str) -> str:
    return f"{container.settings.public_base_url.rstrip('/')}/admin/invite/{token}"


async def create_staff_invite(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    *,
    name: str,
    email: str,
    permissions: list[str],
    expires_at: datetime | None,
) -> tuple[AdminUser, str]:
    email = normalize_email(email)
    if await db.scalar(select(AdminUser).where(AdminUser.email == email)):
        raise ConflictError("Сотрудник с такой почтой уже есть", field="email")
    now = container.clock.now()
    if expires_at is not None and expires_at <= now:
        raise DomainError("Дата окончания доступа должна быть в будущем", field="expires_at")
    token = new_token()
    user = AdminUser(
        name=name.strip(),
        email=email,
        role=AdminRole.STAFF.value,
        permissions=_clean_permissions(permissions),
        expires_at=expires_at,
        invite_token_hash=hash_token(token, container.secret),
        invite_expires_at=now + INVITE_TTL,
    )
    db.add(user)
    await db.flush()
    await audit.record(
        db,
        actor,
        action="staff.invite",
        entity="admin_user",
        entity_id=user.id,
        summary=f"Приглашён сотрудник {user.name} ({user.email})",
        diff={"permissions": [None, user.permissions], "expires_at": [None, expires_at]},
    )
    return user, invite_url(container, token)


async def regenerate_invite(
    db: AsyncSession, container: Container, actor: AdminUser, staff_id: uuid.UUID
) -> str:
    user = await _get_staff(db, staff_id)
    if user.password_hash:
        raise DomainError("Сотрудник уже принял приглашение")
    token = new_token()
    user.invite_token_hash = hash_token(token, container.secret)
    user.invite_expires_at = container.clock.now() + INVITE_TTL
    await audit.record(
        db,
        actor,
        action="staff.invite_renew",
        entity="admin_user",
        entity_id=user.id,
        summary=f"Новая ссылка-приглашение для {user.name}",
    )
    return invite_url(container, token)


async def get_invite(db: AsyncSession, container: Container, token: str) -> AdminUser:
    user = await db.scalar(
        select(AdminUser).where(AdminUser.invite_token_hash == hash_token(token, container.secret))
    )
    now = container.clock.now()
    if user is None or user.invite_expires_at is None or user.invite_expires_at <= now:
        raise InvalidCodeError(
            "Приглашение не найдено или устарело — попросите владельца прислать новое",
            code="invite_invalid",
        )
    reason = _inactive_reason(user, now)
    if reason:
        raise InvalidCodeError(reason, code="invite_invalid")
    return user


async def accept_invite(
    db: AsyncSession,
    container: Container,
    *,
    token: str,
    password: str,
    ip: str | None,
    user_agent: str | None,
) -> SessionTokens:
    validate_password(password)
    user = await get_invite(db, container, token)
    user.password_hash = hash_password(password)
    user.invite_token_hash = None
    user.invite_expires_at = None
    return await _open_session(db, container, user, ip=ip, user_agent=user_agent)


async def _get_staff(db: AsyncSession, staff_id: uuid.UUID) -> AdminUser:
    user = await db.get(AdminUser, staff_id)
    if user is None:
        raise NotFoundError("Сотрудник не найден")
    if user.is_owner:
        raise DomainError("Доступ владельца нельзя изменить здесь")
    return user


async def revoke_staff(
    db: AsyncSession, container: Container, actor: AdminUser, staff_id: uuid.UUID
) -> AdminUser:
    user = await _get_staff(db, staff_id)
    now = container.clock.now()
    user.revoked_at = now
    user.invite_token_hash = None
    await _revoke_sessions(db, container, user.id)
    await audit.record(
        db,
        actor,
        action="staff.revoke",
        entity="admin_user",
        entity_id=user.id,
        summary=f"Отозван доступ сотрудника {user.name}",
    )
    return user


async def update_staff(
    db: AsyncSession,
    container: Container,
    actor: AdminUser,
    staff_id: uuid.UUID,
    *,
    permissions: list[str] | None,
    expires_at: datetime | None,
    restore: bool = False,
) -> AdminUser:
    user = await _get_staff(db, staff_id)
    before = {"permissions": user.permissions, "expires_at": user.expires_at}
    if permissions is not None:
        user.permissions = _clean_permissions(permissions)
    if expires_at is not None:
        if expires_at <= container.clock.now():
            raise DomainError("Дата окончания доступа должна быть в будущем", field="expires_at")
        user.expires_at = expires_at
    if restore:
        user.revoked_at = None
    after = {"permissions": user.permissions, "expires_at": user.expires_at}
    await audit.record(
        db,
        actor,
        action="staff.update",
        entity="admin_user",
        entity_id=user.id,
        summary=f"Изменён доступ сотрудника {user.name}",
        diff=audit.diff_fields(before, after),
    )
    return user


async def list_staff(db: AsyncSession) -> list[AdminUser]:
    return list(
        (await db.scalars(select(AdminUser).order_by(AdminUser.role, AdminUser.created_at))).all()
    )


async def create_telegram_link(
    db: AsyncSession, container: Container, user: AdminUser
) -> tuple[str, str, datetime]:
    code = new_human_code()
    challenge = await _create_challenge(
        db, container, user, ChallengePurpose.TELEGRAM_LINK, code, LINK_TTL
    )
    username = container.settings.telegram_bot_username or "nsbtea_bot"
    return code, f"https://t.me/{username}?start={code}", challenge.expires_at


async def link_telegram_by_code(
    db: AsyncSession, container: Container, *, code: str, chat_id: int, chat_name: str
) -> AdminUser | None:
    """Вызывается ботом на /start CODE. Возвращает сотрудника или None, если код не подошёл."""
    challenge = await db.scalar(
        select(AdminChallenge)
        .where(
            AdminChallenge.code_hash == hash_token(code.strip().upper(), container.secret),
            AdminChallenge.purpose == ChallengePurpose.TELEGRAM_LINK.value,
            AdminChallenge.consumed_at.is_(None),
        )
        .with_for_update()
    )
    now = container.clock.now()
    if challenge is None or challenge.expires_at <= now:
        return None
    user = await db.get(AdminUser, challenge.admin_user_id)
    if user is None or _inactive_reason(user, now):
        return None
    challenge.consumed_at = now
    # чат мог быть привязан к другому сотруднику — отвязываем
    await db.execute(
        update(AdminUser)
        .where(AdminUser.telegram_chat_id == chat_id, AdminUser.id != user.id)
        .values(telegram_chat_id=None)
    )
    user.telegram_chat_id = chat_id
    if user.is_owner:
        recipient = await db.scalar(
            select(NotificationRecipient).where(NotificationRecipient.chat_id == chat_id)
        )
        if recipient is None:
            db.add(
                NotificationRecipient(
                    chat_id=chat_id,
                    name=chat_name or user.name,
                    admin_user_id=user.id,
                    events=[e.value for e in NotificationEvent],
                )
            )
        else:
            recipient.is_active = True
            recipient.admin_user_id = user.id
    await audit.record(
        db,
        user,
        action="auth.telegram_link",
        entity="admin_user",
        entity_id=user.id,
        summary="Подключён Telegram",
    )
    return user


async def unlink_telegram(db: AsyncSession, user: AdminUser) -> None:
    chat_id = user.telegram_chat_id
    user.telegram_chat_id = None
    if chat_id is not None:
        recipient = await db.scalar(
            select(NotificationRecipient).where(NotificationRecipient.chat_id == chat_id)
        )
        if recipient is not None:
            recipient.is_active = False
    await audit.record(
        db,
        user,
        action="auth.telegram_unlink",
        entity="admin_user",
        entity_id=user.id,
        summary="Отключён Telegram",
    )


async def change_password(
    db: AsyncSession,
    container: Container,
    context: AdminContext,
    *,
    current_password: str,
    new_password: str,
) -> None:
    user = context.user
    if not user.password_hash or not verify_password(user.password_hash, current_password):
        raise DomainError("Текущий пароль указан неверно", field="current_password")
    validate_password(new_password)
    user.password_hash = hash_password(new_password)
    await db.execute(
        update(AdminSession)
        .where(
            AdminSession.admin_user_id == user.id,
            AdminSession.id != context.session.id,
            AdminSession.revoked_at.is_(None),
        )
        .values(revoked_at=container.clock.now())
    )
    await audit.record(
        db,
        user,
        action="auth.password_change",
        entity="admin_user",
        entity_id=user.id,
        summary="Пароль изменён",
    )
