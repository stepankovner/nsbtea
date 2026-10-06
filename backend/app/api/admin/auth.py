"""Вход в админку и управление доступами сотрудников."""

import uuid

from fastapi import APIRouter, Request, Response, status

from app.api.deps import (
    ADMIN_COOKIE,
    Admin,
    Db,
    Deps,
    Owner,
    client_ip,
    user_agent,
)
from app.container import Container
from app.models.admin import PERMISSION_LABELS, AdminUser
from app.schemas.admin_auth import (
    AcceptInviteIn,
    AdminMeOut,
    AdminUserOut,
    ChangePasswordIn,
    ForgotPasswordIn,
    InviteInfoOut,
    LoginIn,
    LoginOut,
    PermissionOption,
    ResetPasswordIn,
    StaffCreatedOut,
    StaffCreateIn,
    StaffListOut,
    StaffOut,
    StaffUpdateIn,
    TelegramLinkOut,
    TwoFactorIn,
)
from app.schemas.common import Ok
from app.services import admin_auth
from app.services.admin_auth import SessionTokens

router = APIRouter(prefix="/admin/auth", tags=["admin: вход"])
staff_router = APIRouter(prefix="/admin/staff", tags=["admin: доступы"])


def _set_session_cookie(response: Response, container: Container, tokens: SessionTokens) -> None:
    max_age = int((tokens.expires_at - container.clock.now()).total_seconds())
    response.set_cookie(
        ADMIN_COOKIE,
        tokens.token,
        max_age=max(max_age, 0),
        httponly=True,
        secure=container.settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def _session_out(response: Response, container: Container, tokens: SessionTokens) -> LoginOut:
    _set_session_cookie(response, container, tokens)
    return LoginOut(status="ok", user=AdminUserOut.of(tokens.user), csrf_token=tokens.csrf_token)


@router.post("/login", response_model=LoginOut, summary="Вход по почте и паролю")
async def login(
    payload: LoginIn, request: Request, response: Response, db: Db, container: Deps
) -> LoginOut:
    result = await admin_auth.login(
        db,
        container,
        email=payload.email,
        password=payload.password,
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    if result.tokens is None:
        return LoginOut(status="two_factor_required", challenge_id=result.challenge_id)
    return _session_out(response, container, result.tokens)


@router.post("/2fa", response_model=LoginOut, summary="Подтверждение входа кодом из Telegram")
async def two_factor(
    payload: TwoFactorIn, request: Request, response: Response, db: Db, container: Deps
) -> LoginOut:
    tokens = await admin_auth.verify_two_factor(
        db,
        container,
        challenge_id=payload.challenge_id,
        code=payload.code,
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    return _session_out(response, container, tokens)


@router.get("/me", response_model=AdminMeOut, summary="Текущий сотрудник")
async def me(context: Admin) -> AdminMeOut:
    return AdminMeOut(user=AdminUserOut.of(context.user), csrf_token=context.session.csrf_token)


@router.post("/logout", response_model=Ok, summary="Выйти")
async def logout(context: Admin, response: Response, db: Db, container: Deps) -> Ok:
    await admin_auth.logout(db, container, context)
    response.delete_cookie(ADMIN_COOKIE, path="/")
    return Ok()


@router.post("/password/forgot", response_model=Ok, summary="Код для смены пароля в Telegram")
async def forgot_password(payload: ForgotPasswordIn, db: Db, container: Deps) -> Ok:
    await admin_auth.start_password_reset(db, container, email=payload.email)
    return Ok()


@router.post("/password/reset", response_model=Ok, summary="Новый пароль по коду из Telegram")
async def reset_password(payload: ResetPasswordIn, db: Db, container: Deps) -> Ok:
    await admin_auth.reset_password(
        db, container, email=payload.email, code=payload.code, new_password=payload.new_password
    )
    return Ok()


@router.post("/password/change", response_model=Ok, summary="Сменить пароль")
async def change_password(payload: ChangePasswordIn, context: Admin, db: Db, container: Deps) -> Ok:
    await admin_auth.change_password(
        db,
        container,
        context,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    return Ok()


@router.get("/invite/{token}", response_model=InviteInfoOut, summary="Проверить приглашение")
async def invite_info(token: str, db: Db, container: Deps) -> InviteInfoOut:
    user = await admin_auth.get_invite(db, container, token)
    return InviteInfoOut(name=user.name, email=user.email)


@router.post("/invite/accept", response_model=LoginOut, summary="Принять приглашение")
async def accept_invite(
    payload: AcceptInviteIn, request: Request, response: Response, db: Db, container: Deps
) -> LoginOut:
    tokens = await admin_auth.accept_invite(
        db,
        container,
        token=payload.token,
        password=payload.password,
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    return _session_out(response, container, tokens)


@router.post("/telegram/link", response_model=TelegramLinkOut, summary="Код привязки Telegram")
async def telegram_link(context: Admin, db: Db, container: Deps) -> TelegramLinkOut:
    code, deep_link, expires_at = await admin_auth.create_telegram_link(db, container, context.user)
    return TelegramLinkOut(code=code, deep_link=deep_link, expires_at=expires_at)


@router.post("/telegram/unlink", response_model=Ok, summary="Отвязать Telegram")
async def telegram_unlink(context: Admin, db: Db) -> Ok:
    await admin_auth.unlink_telegram(db, context.user)
    return Ok()


def _permission_options() -> list[PermissionOption]:
    return [PermissionOption(value=p.value, label=label) for p, label in PERMISSION_LABELS.items()]


@staff_router.get("", response_model=StaffListOut, summary="Сотрудники и их доступы")
async def list_staff(_: Owner, db: Db) -> StaffListOut:
    users = await admin_auth.list_staff(db)
    return StaffListOut(items=[StaffOut.of(u) for u in users], permissions=_permission_options())


@staff_router.post(
    "",
    response_model=StaffCreatedOut,
    status_code=status.HTTP_201_CREATED,
    summary="Выдать временный доступ",
)
async def create_staff(
    payload: StaffCreateIn, context: Owner, db: Db, container: Deps
) -> StaffCreatedOut:
    user, url = await admin_auth.create_staff_invite(
        db,
        container,
        context.user,
        name=payload.name,
        email=payload.email,
        permissions=payload.permissions,
        expires_at=payload.expires_at,
    )
    return StaffCreatedOut(staff=StaffOut.of(user), invite_url=url)


@staff_router.patch("/{staff_id}", response_model=StaffOut, summary="Изменить доступ")
async def update_staff(
    staff_id: uuid.UUID, payload: StaffUpdateIn, context: Owner, db: Db, container: Deps
) -> StaffOut:
    user = await admin_auth.update_staff(
        db,
        container,
        context.user,
        staff_id,
        permissions=payload.permissions,
        expires_at=payload.expires_at,
        restore=payload.restore,
    )
    return StaffOut.of(user)


@staff_router.post("/{staff_id}/revoke", response_model=StaffOut, summary="Отозвать доступ")
async def revoke_staff(staff_id: uuid.UUID, context: Owner, db: Db, container: Deps) -> StaffOut:
    user = await admin_auth.revoke_staff(db, container, context.user, staff_id)
    return StaffOut.of(user)


@staff_router.post(
    "/{staff_id}/invite", response_model=StaffCreatedOut, summary="Новая ссылка-приглашение"
)
async def renew_invite(
    staff_id: uuid.UUID, context: Owner, db: Db, container: Deps
) -> StaffCreatedOut:
    url = await admin_auth.regenerate_invite(db, container, context.user, staff_id)
    user = await db.get(AdminUser, staff_id)
    assert user is not None
    return StaffCreatedOut(staff=StaffOut.of(user), invite_url=url)
