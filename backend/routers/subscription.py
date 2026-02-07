from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, desc
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from database.connection import get_db
from database.models import Subscription, User
from routers.user import get_current_user
from services.ytdlp_service import ytdlp_service

router = APIRouter()

# --- Pydantic Models ---
class SubscriptionCreate(BaseModel):
    channel_id: str
    channel_name: str
    channel_thumbnail: Optional[str] = None

class SubscriptionResponse(BaseModel):
    id: int
    channel_id: str
    channel_name: str
    channel_thumbnail: Optional[str]
    subscribed_at: datetime
    
    class Config:
        orm_mode = True

class VideoFeedItem(BaseModel):
    id: str
    title: str
    thumbnail: str
    author: str
    channel_id: str
    published_at: Optional[str] = None
    view_count: Optional[str | int] = None
    duration: Optional[int] = None


# --- Endpoints ---

@router.get("/", response_model=List[SubscriptionResponse])
async def get_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all subscriptions for the current user"""
    result = await db.execute(select(Subscription).filter(Subscription.user_id == current_user.id))
    return result.scalars().all()

@router.get("/status/{channel_id}")
async def check_subscription_status(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user is subscribed to a channel"""
    sub = await db.execute(
        select(Subscription).filter(
            Subscription.user_id == current_user.id,
            Subscription.channel_id == channel_id
        )
    )
    is_subscribed = sub.scalar_one_or_none() is not None
    return {"is_subscribed": is_subscribed}

@router.post("/", response_model=SubscriptionResponse)
async def subscribe_channel(
    sub_data: SubscriptionCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Subscribe to a channel"""
    # Check if already subscribed
    existing = await db.execute(
        select(Subscription).filter(
            Subscription.user_id == current_user.id,
            Subscription.channel_id == sub_data.channel_id
        )
    )
    if existing.scalar_one_or_none():
         raise HTTPException(status_code=400, detail="Already subscribed")

    new_sub = Subscription(
        user_id=current_user.id,
        channel_id=sub_data.channel_id,
        channel_name=sub_data.channel_name,
        channel_thumbnail=sub_data.channel_thumbnail
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)
    
    # Trigger background sync for this channel immediately
    background_tasks.add_task(sync_new_channel, sub_data.channel_id)
    
    return new_sub

async def sync_new_channel(channel_id: str):
    """Background task to sync a single channel"""
    from database.connection import AsyncSessionLocal
    from services.sync_service import sync_service
    import logging
    logger = logging.getLogger(__name__)
    
    async with AsyncSessionLocal() as db:
        try:
             logger.info(f"Syncing new subscription: {channel_id}")
             await sync_service.sync_channel_uploads(db, channel_id, limit=5)
             logger.info(f"Finished syncing new subscription: {channel_id}")
        except Exception as e:
             logger.error(f"Failed to sync new subscription {channel_id}: {e}")

@router.delete("/{channel_id}")
async def unsubscribe_channel(
    channel_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unsubscribe from a channel"""
    await db.execute(
        delete(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.channel_id == channel_id
        )
    )
    await db.commit()
    return {"message": "Unsubscribed"}

@router.get("/feed", response_model=List[VideoFeedItem])
async def get_subscription_feed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get aggregated feed of latest videos from subscribed channels.
    Note: For now this real-time fetches. For production, this should be cached background job.
    We limits to top 10 most recent subscriptions to avoid timeout.
    """
    # Get user subscriptions
    # We might want to sort by something, but for now just all
    subs_result = await db.execute(
        select(Subscription).filter(Subscription.user_id == current_user.id)
    )
    subs = subs_result.scalars().all()
    
    if not subs:
        return []

    # Limit to 10 channels for performance
    target_subs = subs[:10] 
    
    all_videos = []
    
    # Fetch in parallel?
    # ytdlp_service needs an async method for retrieval
    # We will implement get_channel_latest_videos in ytdlp_service
    
    import asyncio
    
    tasks = [ytdlp_service.get_channel_latest_videos(sub.channel_id) for sub in target_subs]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    for res in results:
        if isinstance(res, list):
            all_videos.extend(res)
            
    # Remove duplicates if any
    seen = set()
    unique_videos = []
    for v in all_videos:
        if v['id'] not in seen:
            seen.add(v['id'])
            unique_videos.append(v)
            
    # Sort by published_at descending (newest first)
    # published_at from yt-dlp is usually YYYYMMDD string
    unique_videos.sort(key=lambda x: x.get('published_at') or '00000000', reverse=True)
    
    return unique_videos
