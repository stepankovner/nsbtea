"""Журнал приложения: INFO и выше в stdout (Docker собирает логи контейнеров)."""

import logging
import sys


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if any(getattr(h, "_nsb", False) for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler._nsb = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level)
    # подробности HTTP-клиентов не нужны в обычном журнале
    for noisy in ("httpx", "httpcore", "aiogram.event"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
