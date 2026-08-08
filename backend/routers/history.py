from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database.connection import get_db
from database.models import User, WatchHistory
from routers.user import get_current_user
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

router = APIRouter(
    tags=["history"]
)

class HistoryCreate(BaseModel):
    video_id: str
    title: str
    thumbnail: str
    progress_seconds: int = 0

class HistoryResponse(BaseModel):
    id: int
    video_id: str
    title: str  # Will be mapped from video_title
    thumbnail: str  # Will be mapped from video_thumbnail
    watched_at: datetime
    progress_seconds: int

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=obj.id,
            video_id=obj.video_id,
            title=obj.video_title or "Unknown Title",  # Map DB 'video_title' to API 'title', handle NULL
            thumbnail=obj.video_thumbnail or "",  # Map DB 'video_thumbnail' to API 'thumbnail', handle NULL
            watched_at=obj.watched_at,
            progress_seconds=obj.progress_seconds or 0 # Ensure integer
        )

@router.get("/", response_model=List[HistoryResponse])
async def get_history(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WatchHistory)
        .filter(WatchHistory.user_id == current_user.id)
        .order_by(WatchHistory.watched_at.desc())
        .limit(limit)
    )
    items = result.scalars().all()
    return [HistoryResponse.from_orm(item) for item in items]

@router.post("/", response_model=HistoryResponse)
async def add_history(
    item: HistoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check if entry exists to update timestamp instead of duplicate?
    # For now, let's simple update if exists
    result = await db.execute(
        select(WatchHistory)
        .filter(WatchHistory.user_id == current_user.id, WatchHistory.video_id == item.video_id)
    )
    existing = result.scalars().first()
    
    if existing:
        existing.watched_at = datetime.utcnow()
        existing.progress_seconds = item.progress_seconds
        await db.commit()
        await db.refresh(existing)
        return HistoryResponse.from_orm(existing)
    
    new_entry = WatchHistory(
        user_id=current_user.id,
        video_id=item.video_id,
        video_title=item.title,  # Map API 'title' to DB 'video_title'
        video_thumbnail=item.thumbnail,  # Map API 'thumbnail' to DB 'video_thumbnail'
        progress_seconds=item.progress_seconds
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return HistoryResponse.from_orm(new_entry)

@router.delete("/item/{video_id}")
async def delete_history_item(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific video from user's watch history"""
    from sqlalchemy import delete
    stmt = delete(WatchHistory).where(
        WatchHistory.user_id == current_user.id,
        WatchHistory.video_id == video_id,
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "success", "message": f"Video {video_id} removed from history"}

@router.delete("/clear")
async def clear_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear all watch history for a user"""
    from sqlalchemy import delete
    stmt = delete(WatchHistory).where(WatchHistory.user_id == current_user.id)
    await db.execute(stmt)
    await db.commit()
    return {"status": "success", "message": "All watch history cleared"}
