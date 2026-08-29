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
from services.cache_service import cache_service

router = APIRouter()

# --- Pydantic Models ---
class SubscriptionCreate(BaseModel):
    channel_id: str
    channel_name: str
    channel_thumbnail: Optional[str] = None
    notify_enabled: bool = True  # 訂閱即預設開啟鈴鐺，讓「最新通知」分頁也有資料

class SubscriptionResponse(BaseModel):
    id: int
    channel_id: str
    channel_name: str
    channel_thumbnail: Optional[str]
    notify_enabled: bool
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
    sub_obj = sub.scalar_one_or_none()
    is_subscribed = sub_obj is not None
    notify_enabled = sub_obj.notify_enabled if sub_obj else False
    return {"is_subscribed": is_subscribed, "notify_enabled": notify_enabled}

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
        channel_thumbnail=sub_data.channel_thumbnail,
        notify_enabled=sub_data.notify_enabled
    )
    db.add(new_sub)
    await db.commit()
    await db.refresh(new_sub)

    # Invalidate cached subscription feed + notifications so the new channel
    # shows up immediately instead of after the 10 minute TTL
    await cache_service.delete(f"subs_feed:{current_user.id}")
    await cache_service.delete(f"subs_notifications:{current_user.id}")

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
    await cache_service.delete(f"subs_feed:{current_user.id}")
    await cache_service.delete(f"subs_notifications:{current_user.id}")
    return {"message": "Unsubscribed"}

@router.get("/feed", response_model=List[VideoFeedItem])
async def get_subscription_feed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get aggregated feed of latest videos from subscribed channels.
    Real-time fetches each channel's latest uploads (not gated by notify_enabled
    or a 7-day window) and caches the result per user. This is the "訂閱內容" feed.
    """
    # Serve from cache if available (per-user, short TTL for freshness)
    cache_key = f"subs_feed:{current_user.id}"
    cached = await cache_service.get(cache_key)
    if cached is not None:
        return cached

    # Get user subscriptions
    subs_result = await db.execute(
        select(Subscription).filter(Subscription.user_id == current_user.id)
    )
    subs = subs_result.scalars().all()

    if not subs:
        return []

    # Cap channels fetched per request to bound latency
    target_subs = subs[:30]

    all_videos = []

    import asyncio

    tasks = [ytdlp_service.get_channel_latest_videos(sub.channel_id, limit=5) for sub in target_subs]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for res in results:
        if isinstance(res, list):
            all_videos.extend(res)

    # Remove duplicates if any
    seen = set()
    unique_videos = []
    for v in all_videos:
        if v.get('id') and v['id'] not in seen:
            seen.add(v['id'])
            unique_videos.append(v)

    # Sort by published_at descending (newest first).
    # _format_date returns 'YYYY-MM-DD'; missing dates sort last.
    unique_videos.sort(key=lambda x: x.get('published_at') or '', reverse=True)

    # Cache for 10 minutes; new subscriptions clear this key (see subscribe/unsubscribe)
    await cache_service.set(cache_key, unique_videos, ttl=600)

    return unique_videos

@router.put("/{channel_id}/notify")
async def toggle_notification(
    channel_id: str,
    enable: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle notification for a subscription"""
    stmt = select(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.channel_id == channel_id
    )
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()
    
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
        
    if enable is not None:
        sub.notify_enabled = enable
    else:
        sub.notify_enabled = not sub.notify_enabled
        
    await db.commit()
    # Channel set for the notifications tab changed -> drop its cached page
    await cache_service.delete(f"subs_notifications:{current_user.id}")
    return {"message": "Notification updated", "notify_enabled": sub.notify_enabled}

@router.get("/notifications", response_model=List[VideoFeedItem])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get recent uploads (last 7 days) from subscribed channels that have
    notifications enabled. Fetches in real-time per channel (no dependency on
    the SyncService having populated the Videos table) and caches per user.
    """
    cache_key = f"subs_notifications:{current_user.id}"
    cached = await cache_service.get(cache_key)
    if cached is not None:
        return cached

    # 1. Channels with notifications enabled
    stmt = select(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.notify_enabled == True
    )
    result = await db.execute(stmt)
    subs = result.scalars().all()

    if not subs:
        return []

    name_map = {s.channel_id: s.channel_name for s in subs}

    # 2. Real-time fetch latest uploads per channel (parallel)
    import asyncio
    from datetime import timedelta
    tasks = [ytdlp_service.get_channel_latest_videos(s.channel_id, limit=5) for s in subs[:30]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 3. Keep only uploads from the last 7 days (published_at is 'YYYY-MM-DD')
    cutoff = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    feed_items = []
    seen = set()
    for res in results:
        if not isinstance(res, list):
            continue
        for v in res:
            vid = v.get('id')
            pub = v.get('published_at')
            if not vid or vid in seen:
                continue
            if not pub or pub < cutoff:  # recent only
                continue
            seen.add(vid)
            feed_items.append({
                "id": vid,
                "title": v.get('title') or '',
                "thumbnail": v.get('thumbnail') or f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                "author": v.get('author') or name_map.get(v.get('channel_id'), "Unknown"),
                "channel_id": v.get('channel_id') or '',
                "published_at": pub,
                "view_count": v.get('view_count'),
                "duration": v.get('duration'),
            })

    feed_items.sort(key=lambda x: x.get('published_at') or '', reverse=True)

    # Cache for 10 minutes (also bounds how often the navbar badge triggers fetches)
    await cache_service.set(cache_key, feed_items, ttl=600)

    return feed_items
