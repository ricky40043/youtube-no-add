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
            
            # Fetch new recommendations based on refreshed profile
            await recommendation_service.fetch_recommendations_for_user(db, user_id)
            
            logger.info(f"Background sync finished for user {user_id}")
            
        except Exception as e:
            logger.error(f"Background sync failed: {e}")

@router.get("/")
async def get_feed(
    cursor: Optional[str] = None, # Used as integer offset now
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get personalized recommendation feed.
    """
    # 1. Fetch User Profile Text for TF-IDF
    user_profile_text = await recommendation_service.get_user_profile_text(db, current_user.id)
    
    # 2. Fetch Subscriptions
    stmt_subs = select(Subscription.channel_id).where(Subscription.user_id == current_user.id)
    result_subs = await db.execute(stmt_subs)
    sub_channel_ids = set(result_subs.scalars().all())
    
    # 3. Fetch candidate videos (e.g. recent 60 days)
    from sqlalchemy import desc
    one_month_ago = datetime.utcnow() - timedelta(days=60)
    
    # Fetch top 800 overall recent videos
    stmt_videos = select(Video).where(Video.published_at >= one_month_ago).order_by(Video.published_at.desc()).limit(800)
    result_videos = await db.execute(stmt_videos)
    videos = result_videos.scalars().all()
    
    # 4. Batch Score them using TF-IDF
    scored_results = await recommendation_service.calculate_scores_batch(user_profile_text, videos, sub_channel_ids)
    
    valid_scored = []
    for score, v in scored_results:
        # Check affinity to include ALL subscribed items, or high score items
        if v.channel_id in sub_channel_ids or score > 0.001:
            valid_scored.append((score, v))
            
    # Sort by score desc, then by date desc
    valid_scored.sort(key=lambda x: (x[0], x[1].published_at.timestamp() if x[1].published_at else 0), reverse=True)
    
    # 5. Paginate
    offset = 0
    if cursor:
        try:
            offset = int(cursor)
        except ValueError:
            pass

    paged_items = [x[1] for x in valid_scored[offset : offset + limit]]
    
    has_next = (offset + limit) < len(valid_scored)
    next_cursor = str(offset + limit) if has_next else None

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
