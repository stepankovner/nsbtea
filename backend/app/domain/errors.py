"""Ошибки бизнес-логики.

`message` — готовый текст для человека на русском («Нельзя списать 200 г: на складе 150 г»).
API отдаёт его как есть, поэтому здесь не должно быть технического жаргона.
"""


class DomainError(Exception):
    """Нарушено бизнес-правило. HTTP 422 по умолчанию."""

    code: str = "domain_error"
    http_status: int = 422

    def __init__(self, message: str, *, code: str | None = None, field: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.field = field
        if code is not None:
            self.code = code


class InsufficientStockError(DomainError):
    code = "insufficient_stock"
    http_status = 409


class InvalidTransitionError(DomainError):
    code = "invalid_transition"
    http_status = 409


class NotFoundError(DomainError):
    code = "not_found"
    http_status = 404


class ConflictError(DomainError):
    code = "conflict"
    http_status = 409


class PermissionDeniedError(DomainError):
    code = "forbidden"
    http_status = 403


class AuthRequiredError(DomainError):
    code = "auth_required"
    http_status = 401


class InvalidCodeError(DomainError):
    """Одноразовый код неверен, устарел или исчерпаны попытки."""

    code = "invalid_code"
    http_status = 400
