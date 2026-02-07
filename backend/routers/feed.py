from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional, List
import base64
import logging
import random
from datetime import datetime, timedelta

from database.connection import get_db, AsyncSessionLocal
from database.models import Video, Subscription, UserTagAffinity, User, Channel
from services.recommendation_service import recommendation_service
from services.sync_service import sync_service
from routers.user import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

async def run_sync_task(user_id: int):
    """Background task to sync uploads for all user subscriptions"""
    async with AsyncSessionLocal() as db:
        try:
            # Get user subscriptions
            stmt = select(Subscription.channel_id).where(Subscription.user_id == user_id)
            result = await db.execute(stmt)
            channel_ids = result.scalars().all()
            
            logger.info(f"Starting background sync for user {user_id} ({len(channel_ids)} channels)")
            
            for cid in channel_ids:
                await sync_service.sync_channel_uploads(db, cid)
            
            # Refresh profile after sync
            await recommendation_service.refresh_user_profile(db, user_id)
            logger.info(f"Background sync finished for user {user_id}")
            
        except Exception as e:
            logger.error(f"Background sync failed: {e}")

@router.get("/")
async def get_feed(
    cursor: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get personalized recommendation feed.
    """
    # 1. Fetch User Profile (optional now if we sort by date, but keeping it)
    # ... (omitted, standard part)
    
    # 2. Parse Cursor
    last_pub_ts = None
    last_vid_id = None
    
    if cursor:
        try:
            decoded = base64.b64decode(cursor).decode()
            parts = decoded.split('|')
            last_ts_str = parts[0]
            last_vid_id = parts[1] if len(parts) > 1 else ""
            last_pub_ts = float(last_ts_str)
        except Exception as e:
            logger.warning(f"Invalid cursor: {e}")

    # 3. Build Query
    # Filter: Within last 180 days (global window)
    one_month_ago = datetime.utcnow() - timedelta(days=180)
    
    from sqlalchemy import and_, or_
    
    # Base conditions
    conditions = [
        Subscription.user_id == current_user.id,
        Video.published_at >= one_month_ago
    ]
    
    # Cursor conditions (Keyset Pagination)
    if last_pub_ts is not None:
        last_pub_dt = datetime.utcfromtimestamp(last_pub_ts)
        # (published_at < dt) OR (published_at == dt AND id < last_id)
        # Note: published_at is DESC. So we want smaller dates.
        # But wait, published_at in DB might be different precision?
        # Safe comparison: 
        conditions.append(
            or_(
                Video.published_at < last_pub_dt,
                and_(Video.published_at == last_pub_dt, Video.id < last_vid_id)
            )
        )

    stmt = select(Video).join(Subscription, Subscription.channel_id == Video.channel_id)\
        .where(and_(*conditions))\
        .order_by(Video.published_at.desc(), Video.id.desc())\
        .limit(limit) # Efficient fetch matching request size
        
    result = await db.execute(stmt)
    # We fetch 'limit' items. If we get 'limit' items, there *might* be more.
    # To know if hasNext, usually fetch limit+1.
    
    # Let's re-execute with limit+1
    stmt = stmt.limit(limit + 1)
    result = await db.execute(stmt)
    videos = result.scalars().all()
    
    has_next = len(videos) > limit
    paged_items = videos[:limit]
    
    # 4. Next Cursor construction
    next_cursor = None
    if has_next and paged_items:
        last_item = paged_items[-1]
        cursor_str = f"{last_item.published_at.timestamp()}|{last_item.id}"
        next_cursor = base64.b64encode(cursor_str.encode()).decode()

    return {
        "items": paged_items,
        "next_cursor": next_cursor
    }

@router.post("/sync")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """
    Manually trigger a sync for all subscriptions.
    """
    background_tasks.add_task(run_sync_task, current_user.id)
    return {"status": "Background sync started"}

@router.post("/refresh-profile")
async def refresh_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Force refresh user interest profile.
    """
    await recommendation_service.refresh_user_profile(db, current_user.id)
    return {"status": "Profile refreshed"}
