"""Вход в админку (SPEC 10.9): пароль + код в Telegram, сессии, CSRF, временный доступ."""

from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import DomainError
from app.models import AdminSession, AdminUser, AuditLog
from app.models.admin import AdminRole
from app.services.admin_auth import create_owner
from app.services.telegram_bot import handle_start_command
from tests.helpers import (
    OWNER_EMAIL,
    OWNER_PASSWORD,
    create_admin,
    extract_code,
    login,
    outbox,
)


class TestCreateOwner:
    async def test_create_owner(self, db: AsyncSession) -> None:
        user = await create_owner(db, email="Owner@Nsbtea.test ", name="Никита", password="x" * 12)
        await db.commit()
        assert user.email == "owner@nsbtea.test"
        assert user.role == AdminRole.OWNER.value
        assert user.password_hash
        assert user.password_hash != "x" * 12

    async def test_short_password_rejected(self, db: AsyncSession) -> None:
        with pytest.raises(DomainError, match="не короче 10"):
            await create_owner(db, email="o@nsbtea.test", name="Н", password="short")


class TestLogin:
    async def test_login_without_telegram(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        response = await client.post(
            "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["user"]["email"] == OWNER_EMAIL
        assert body["user"]["role"] == "owner"
        assert body["user"]["telegram_linked"] is False
        cookie = response.headers["set-cookie"]
        assert "nsb_admin=" in cookie
        assert "HttpOnly" in cookie
        assert "Secure" in cookie
        assert "SameSite=lax" in cookie.lower() or "samesite=lax" in cookie.lower()

    async def test_wrong_password(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        response = await client.post(
            "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": "не тот пароль"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Неверная почта или пароль"

    async def test_unknown_email_same_message(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/admin/auth/login", json={"email": "nobody@nsbtea.test", "password": "x" * 12}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Неверная почта или пароль"

    async def test_email_case_insensitive(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        response = await client.post(
            "/api/admin/auth/login",
            json={"email": OWNER_EMAIL.upper(), "password": OWNER_PASSWORD},
        )
        assert response.status_code == 200

    async def test_rate_limited(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        for _ in range(10):
            await client.post(
                "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": "wrong-password"}
            )
        response = await client.post(
            "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        )
        assert response.status_code == 429
        assert "Слишком много попыток" in response.json()["detail"]

    async def test_login_is_audited(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        await login(client)
        entries = (await db.scalars(select(AuditLog))).all()
        assert [e.action for e in entries] == ["auth.login"]


class TestTwoFactor:
    async def test_code_sent_to_telegram(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db, telegram_chat_id=555)
        response = await client.post(
            "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "two_factor_required"
        assert "set-cookie" not in response.headers

        messages = await outbox(db, channel="telegram")
        assert len(messages) == 1
        assert messages[0].recipient == "555"
        code = extract_code(messages[0].body)

        response = await client.post(
            "/api/admin/auth/2fa", json={"challenge_id": body["challenge_id"], "code": code}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert "nsb_admin=" in response.headers["set-cookie"]

    async def test_wrong_code_then_burned(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db, telegram_chat_id=555)
        body = (
            await client.post(
                "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
            )
        ).json()
        code = extract_code((await outbox(db, channel="telegram"))[0].body)
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            response = await client.post(
                "/api/admin/auth/2fa", json={"challenge_id": body["challenge_id"], "code": wrong}
            )
            assert response.status_code == 400
        # после 5 ошибок даже верный код не принимается
        response = await client.post(
            "/api/admin/auth/2fa", json={"challenge_id": body["challenge_id"], "code": code}
        )
        assert response.status_code == 400
        assert "войдите заново" in response.json()["detail"]

    async def test_expired_code(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await create_admin(db, telegram_chat_id=555)
        body = (
            await client.post(
                "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
            )
        ).json()
        code = extract_code((await outbox(db, channel="telegram"))[0].body)
        container.clock.advance(minutes=11)  # type: ignore[attr-defined]
        response = await client.post(
            "/api/admin/auth/2fa", json={"challenge_id": body["challenge_id"], "code": code}
        )
        assert response.status_code == 400
        assert "устарел" in response.json()["detail"]


class TestSession:
    async def test_me(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        csrf = await login(client)
        response = await client.get("/api/admin/auth/me")
        assert response.status_code == 200
        assert response.json()["user"]["name"] == "Никита"
        assert response.json()["csrf_token"] == csrf

    async def test_anonymous_is_401(self, client: AsyncClient) -> None:
        response = await client.get("/api/admin/auth/me")
        assert response.status_code == 401
        assert response.json()["detail"] == "Войдите в админку"

    async def test_csrf_required_for_changes(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        await login(client)
        del client.headers["X-CSRF-Token"]
        response = await client.post("/api/admin/auth/logout")
        assert response.status_code == 403
        assert "обновите страницу" in response.json()["detail"]

    async def test_logout(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        await login(client)
        response = await client.post("/api/admin/auth/logout")
        assert response.status_code == 200
        assert (await client.get("/api/admin/auth/me")).status_code == 401

    async def test_session_expires(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await create_admin(db)
        await login(client)
        container.clock.advance(days=15)  # type: ignore[attr-defined]
        assert (await client.get("/api/admin/auth/me")).status_code == 401


class TestStaff:
    async def test_invite_accept_and_permissions(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await create_admin(db)
        await login(client)
        expires = (container.clock.now() + timedelta(days=30)).isoformat()
        response = await client.post(
            "/api/admin/staff",
            json={
                "name": "Помощник",
                "email": "helper@nsbtea.test",
                "permissions": ["orders", "inventory"],
                "expires_at": expires,
            },
        )
        assert response.status_code == 201, response.text
        invite_url = response.json()["invite_url"]
        assert invite_url.startswith("https://nsbtea.test/admin/invite/")
        token = invite_url.rsplit("/", 1)[1]

        client.cookies.clear()
        client.headers.pop("X-CSRF-Token", None)
        info = await client.get(f"/api/admin/auth/invite/{token}")
        assert info.status_code == 200
        assert info.json()["name"] == "Помощник"

        response = await client.post(
            "/api/admin/auth/invite/accept", json={"token": token, "password": "пароль-помощника"}
        )
        assert response.status_code == 200, response.text
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        me = (await client.get("/api/admin/auth/me")).json()["user"]
        assert me["role"] == "staff"
        assert set(me["permissions"]) == {"orders", "inventory"}

        # доступ к чужому разделу закрыт
        response = await client.get("/api/admin/staff")
        assert response.status_code == 403
        assert response.json()["detail"] == "Этот раздел доступен только владельцу"

        # повторно приглашение не работает
        again = await client.post(
            "/api/admin/auth/invite/accept", json={"token": token, "password": "пароль-помощника"}
        )
        assert again.status_code == 400

    async def test_revoke_kills_sessions(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db)
        staff = await create_admin(
            db,
            email="helper@nsbtea.test",
            password="пароль-помощника",
            role=AdminRole.STAFF,
            permissions=["orders"],
        )
        staff_id = staff.id

        transport = client._transport
        assert isinstance(transport, ASGITransport)
        async with AsyncClient(transport=transport, base_url="https://nsbtea.test") as helper:
            await login(helper, "helper@nsbtea.test", "пароль-помощника")
            assert (await helper.get("/api/admin/auth/me")).status_code == 200

            await login(client)
            response = await client.post(f"/api/admin/staff/{staff_id}/revoke")
            assert response.status_code == 200

            response = await helper.get("/api/admin/auth/me")
            assert response.status_code == 401
            assert response.json()["detail"] == "Доступ отозван владельцем"

        sessions = (
            await db.scalars(select(AdminSession).where(AdminSession.admin_user_id == staff_id))
        ).all()
        assert all(s.revoked_at is not None for s in sessions)

    async def test_expired_staff_cannot_login(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        await create_admin(
            db,
            email="helper@nsbtea.test",
            password="пароль-помощника",
            role=AdminRole.STAFF,
            expires_at=container.clock.now() - timedelta(minutes=1),
        )
        response = await client.post(
            "/api/admin/auth/login",
            json={"email": "helper@nsbtea.test", "password": "пароль-помощника"},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Срок доступа истёк — попросите владельца продлить"

    async def test_staff_cannot_create_staff(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(
            db,
            email="helper@nsbtea.test",
            password="пароль-помощника",
            role=AdminRole.STAFF,
            permissions=["orders"],
        )
        await login(client, "helper@nsbtea.test", "пароль-помощника")
        response = await client.post(
            "/api/admin/staff",
            json={"name": "Ещё", "email": "x@nsbtea.test", "permissions": ["orders"]},
        )
        assert response.status_code == 403


class TestPasswordReset:
    async def test_reset_via_telegram(self, client: AsyncClient, db: AsyncSession) -> None:
        await create_admin(db, telegram_chat_id=777)
        response = await client.post("/api/admin/auth/password/forgot", json={"email": OWNER_EMAIL})
        assert response.status_code == 200
        code = extract_code((await outbox(db, channel="telegram"))[0].body)

        response = await client.post(
            "/api/admin/auth/password/reset",
            json={"email": OWNER_EMAIL, "code": code, "new_password": "новый-надёжный-пароль"},
        )
        assert response.status_code == 200
        bad = await client.post(
            "/api/admin/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
        )
        assert bad.status_code == 401
        # вход по новому паролю требует кода из Telegram
        good = await client.post(
            "/api/admin/auth/login",
            json={"email": OWNER_EMAIL, "password": "новый-надёжный-пароль"},
        )
        assert good.json()["status"] == "two_factor_required"

    async def test_unknown_email_does_not_leak(self, client: AsyncClient, db: AsyncSession) -> None:
        response = await client.post(
            "/api/admin/auth/password/forgot", json={"email": "ghost@nsbtea.test"}
        )
        assert response.status_code == 200
        assert await outbox(db) == []


class TestTelegramLink:
    async def test_link_code_and_bot_start(
        self, client: AsyncClient, db: AsyncSession, container: Container
    ) -> None:
        user = await create_admin(db)
        await login(client)
        response = await client.post("/api/admin/auth/telegram/link")
        assert response.status_code == 200
        body = response.json()
        assert body["deep_link"].startswith("https://t.me/nsbtea_test_bot?start=")
        code = body["code"]

        async with container.session_factory() as session:
            reply = await handle_start_command(
                session, container, chat_id=4242, payload=code, from_name="Никита"
            )
            await session.commit()
        assert "Готово" in reply

        await db.refresh(user)
        assert user.telegram_chat_id == 4242
        me = (await client.get("/api/admin/auth/me")).json()["user"]
        assert me["telegram_linked"] is True

    async def test_bot_rejects_unknown_code(self, db: AsyncSession, container: Container) -> None:
        async with container.session_factory() as session:
            reply = await handle_start_command(
                session, container, chat_id=1, payload="WRONG123", from_name="x"
            )
        assert "не подошёл" in reply
        assert (await db.scalars(select(AdminUser))).all() == []
