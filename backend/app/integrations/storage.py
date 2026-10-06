"""Хранилище файлов: локальная папка (разработка) или S3-совместимое хранилище в РФ."""

import asyncio
from pathlib import Path
from typing import Protocol

import boto3


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...

    async def delete(self, key: str) -> None: ...

    def url(self, key: str) -> str: ...


class LocalStorage:
    def __init__(self, root: str, public_url: str) -> None:
        self._root = Path(root)
        self._public_url = public_url.rstrip("/")

    @property
    def root(self) -> Path:
        return self._root

    def _path(self, key: str) -> Path:
        path = (self._root / key).resolve()
        if self._root.resolve() not in path.parents:
            raise ValueError("недопустимый путь к файлу")
        return path

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)

    async def delete(self, key: str) -> None:
        path = self._path(key)
        await asyncio.to_thread(path.unlink, missing_ok=True)

    def url(self, key: str) -> str:
        return f"{self._public_url}/{key}"


class S3Storage:
    def __init__(
        self,
        *,
        endpoint_url: str | None,
        region: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        public_url: str,
    ) -> None:
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        self._bucket = bucket
        self._public_url = public_url.rstrip("/")

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)

    def url(self, key: str) -> str:
        return f"{self._public_url}/{key}"
