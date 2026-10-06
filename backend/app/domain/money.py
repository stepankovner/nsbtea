"""Деньги — только целые копейки. Никаких float."""

NBSP = " "
MINUS = "−"


def round_half_up_div(numerator: int, denominator: int) -> int:
    """Целочисленное деление с округлением половины вверх (для неотрицательных чисел)."""
    if denominator <= 0:
        raise ValueError("делитель должен быть положительным")
    if numerator < 0:
        raise ValueError("отрицательные суммы здесь не поддерживаются")
    return (2 * numerator + denominator) // (2 * denominator)


def round_to_rub(kop: int) -> int:
    """Округлить копейки до целого рубля (half-up), результат — снова в копейках."""
    return round_half_up_div(kop, 100) * 100


def ceil_to_rub(kop: int) -> int:
    """Округлить вверх до целого рубля (в копейках)."""
    if kop < 0:
        raise ValueError("отрицательные суммы здесь не поддерживаются")
    return -(-kop // 100) * 100


def percent_of_rub(amount_kop: int, percent: int) -> int:
    """Процент от суммы, округлённый до целого рубля half-up (в копейках)."""
    if not 0 <= percent <= 100:
        raise ValueError("процент должен быть от 0 до 100")
    return round_half_up_div(amount_kop * percent, 100 * 100) * 100


def _group_thousands(value: int) -> str:
    digits = str(value)
    groups: list[str] = []
    while digits:
        groups.insert(0, digits[-3:])
        digits = digits[:-3]
    return NBSP.join(groups)


def format_rub(kop: int) -> str:
    """«1 200 ₽», «123,50 ₽» — с неразрывными пробелами."""
    sign = MINUS if kop < 0 else ""
    kop = abs(kop)
    rub, rest = divmod(kop, 100)
    text = _group_thousands(rub)
    if rest:
        text += f",{rest:02d}"
    return f"{sign}{text}{NBSP}₽"
