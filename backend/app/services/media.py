"""Загрузка картинок: проверка, поворот по EXIF, конвертация в WebP нескольких размеров."""

import asyncio
import io
import uuid
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.container import Container
from app.domain.errors import DomainError
from app.models import MediaFile

VARIANT_WIDTHS = (320, 640, 1024, 1600)
MAX_ORIGINAL_SIDE = 2400
MAX_PIXELS = 50_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO", "GIF"}
WEBP_QUALITY = 82

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    width: int
    height: int
    files: dict[str, bytes]  # "original" и ширины → WebP


def _encode(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
    return buffer.getvalue()


def process_image(data: bytes) -> ProcessedImage:
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        opened = Image.open(io.BytesIO(data))
        if opened.format not in ALLOWED_FORMATS:
            raise DomainError("Формат не поддерживается — загрузите JPEG, PNG или WebP")
        image: Image.Image = ImageOps.exif_transpose(opened)
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError) as exc:
        raise DomainError("Файл не похож на фото — загрузите JPEG, PNG или WebP") from exc

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    image.thumbnail((MAX_ORIGINAL_SIDE, MAX_ORIGINAL_SIDE), Image.Resampling.LANCZOS)
    width, height = image.size
    files = {"original": _encode(image)}
    for target in VARIANT_WIDTHS:
        if target >= width:
            continue
        variant = image.resize(
            (target, max(1, round(height * target / width))), Image.Resampling.LANCZOS
        )
        files[str(target)] = _encode(variant)
    return ProcessedImage(width=width, height=height, files=files)


async def upload_image(
    db: AsyncSession, container: Container, data: bytes, original_name: str | None
) -> MediaFile:
    limit = container.settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise DomainError(f"Файл больше {container.settings.max_upload_mb} МБ — уменьшите фото")
    if not data:
        raise DomainError("Файл пустой")
    processed = await asyncio.to_thread(process_image, data)
    base = f"images/{uuid.uuid4().hex}"
    keys: dict[str, str] = {}
    for name, content in processed.files.items():
        key = f"{base}/{name}.webp"
        await container.storage.put(key, content, "image/webp")
        keys[name] = key
    media = MediaFile(
        storage_key=keys["original"],
        variants=keys,
        width=processed.width,
        height=processed.height,
        size_bytes=len(data),
        original_name=(original_name or "")[:300] or None,
    )
    db.add(media)
    await db.flush()
    return media


def media_urls(container: Container, media: MediaFile) -> dict[str, str]:
    """{"original": url, "320": url, ...} — для srcset на витрине."""
    return {name: container.storage.url(key) for name, key in media.variants.items()}
