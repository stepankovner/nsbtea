"""UUID v7 — сортируемые по времени идентификаторы (RFC 9562)."""

import os
import time
import uuid


def uuid7() -> uuid.UUID:
    unix_ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10), "big")
    rand_a = rand >> 62 & 0xFFF  # 12 бит
    rand_b = rand & ((1 << 62) - 1)  # 62 бита
    value = (unix_ms & ((1 << 48) - 1)) << 80
    value |= 0x7 << 76  # версия
    value |= rand_a << 64
    value |= 0b10 << 62  # вариант RFC 4122
    value |= rand_b
    return uuid.UUID(int=value)
