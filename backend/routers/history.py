from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database.connection import get_db
from database.models import WatchHistory
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

router = APIRouter(
    tags=["history"]
)

class HistoryCreate(BaseModel):
    user_id: int # To be injected via auth later
    video_id: str
    title: str
    thumbnail: str
    progress_seconds: int = 0

class HistoryResponse(BaseModel):
    id: int
    video_id: str
    title: str
    thumbnail: str
    watched_at: datetime
    progress_seconds: int

    class Config:
        orm_mode = True

@router.get("/", response_model=List[HistoryResponse])
async def get_history(user_id: int, limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WatchHistory)
        .filter(WatchHistory.user_id == user_id)
        .order_by(WatchHistory.watched_at.desc())
        .limit(limit)
    )
    return result.scalars().all()

@router.post("/", response_model=HistoryResponse)
async def add_history(item: HistoryCreate, db: AsyncSession = Depends(get_db)):
    # Check if entry exists to update timestamp instead of duplicate?
    # For now, let's simple update if exists
    result = await db.execute(
        select(WatchHistory)
        .filter(WatchHistory.user_id == item.user_id, WatchHistory.video_id == item.video_id)
    )
    existing = result.scalars().first()
    
    if existing:
        existing.watched_at = datetime.utcnow()
        existing.progress_seconds = item.progress_seconds
        await db.commit()
        await db.refresh(existing)
        return existing
    
    new_entry = WatchHistory(
        user_id=item.user_id,
        video_id=item.video_id,
        title=item.title,
        thumbnail=item.thumbnail,
        progress_seconds=item.progress_seconds
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return new_entry
