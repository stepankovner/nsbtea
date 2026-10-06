from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import Db

router = APIRouter(tags=["служебное"])


class HealthOut(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=HealthOut, summary="Проверка работоспособности")
async def health(db: Db) -> HealthOut:
    await db.execute(text("SELECT 1"))
    return HealthOut(status="ok", database="ok")
