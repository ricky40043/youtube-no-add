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

# How long a sync-status marker lives in cache. Long enough to outlive a slow
# sync, short enough that a crashed worker cannot pin the status to "running".
SYNC_STATUS_TTL = 900


def sync_status_key(user_id: int) -> str:
    """Cache key holding the last known sync state for a user.

    Deliberately NOT matched by the `feed:{user_id}:*` invalidation pattern used
    for cached feed pages, so clearing the feed cache never wipes the status.
    """
    return f"feed:sync_status:{user_id}"


async def run_sync_task(user_id: int):
    """Background task to sync uploads for all user subscriptions"""
    from services.cache_service import cache_service

    await cache_service.set(
        sync_status_key(user_id),
        {"status": "running"},
        ttl=SYNC_STATUS_TTL,
    )
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

            # Sync changes the source data. Invalidate all per-user feed pages so
            # the next view cannot serve a pre-sync recommendation snapshot.
            await cache_service.delete_pattern(f"feed:{user_id}:*")
            await cache_service.delete_pattern(f"feed:precomputed:{user_id}*")
            await cache_service.delete(f"subs_feed:{user_id}")

            logger.info(f"Background sync finished for user {user_id}")

        except Exception as e:
            logger.error(f"Background sync failed: {e}")
        finally:
            # Always publish a terminal state: the client waits on this before
            # reloading the feed, and must not wait forever on a failed sync.
            await cache_service.set(
                sync_status_key(user_id),
                {"status": "done"},
                ttl=SYNC_STATUS_TTL,
            )

@router.get("/")
async def get_feed(
    cursor: Optional[str] = None,
    limit: int = 20,  # Reduced default
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Get personalized recommendation feed.
    Uses watch history from database to find relevant videos via yt-dlp search.
    """
    import time
    from services.cache_service import cache_service
    
    start_time = time.time()
    user_id = current_user.id if current_user else 'anonymous'
    print(f"[FEED] Request started, cursor={cursor}, limit={limit}, user={user_id}")
    
    # Check cache first (only for first page, anonymous users, or users without history)
    cache_key = f"feed:{user_id}:{cursor or '0'}:{limit}"
    if not current_user or not cursor:
        cached = await cache_service.get(cache_key)
        if cached:
            print(f"[FEED] Cache hit for {cache_key}")
            return cached
    
    # Only compute if not cached
    from services.ytdlp_service import ytdlp_service
    
    # Parse cursor
    page = 0
    if cursor:
        try:
            page = int(cursor)
        except ValueError:
            page = 0
    
    all_videos = []
    seen_ids = set()
    
    # Build search queries from user's interests
    search_queries = []
    watch_history_titles = []
    
    # 1. Get watch history from DATABASE (only if logged in)
    # Use top 10 for initial, more for pagination
    history_limit = 10 + page * 5  # page 0: 10, page 1: 15, page 2: 20...
    if current_user:
        try:
            from database.models import WatchHistory
            stmt = select(WatchHistory).where(
                WatchHistory.user_id == current_user.id
            ).order_by(WatchHistory.watched_at.desc()).limit(history_limit)
            result = await db.execute(stmt)
            history_items = result.scalars().all()
            
            for wh in history_items:
                if wh.video_title:
                    watch_history_titles.append(wh.video_title)
            print(f"[FEED] Got {len(watch_history_titles)} watch history from DB (limit: {history_limit})")
        except Exception as e:
            print(f"[FEED] Failed to get watch history from DB: {e}")
    
    # 2. Extract keywords from watch history titles
    for title in watch_history_titles[:10]:  # Increased from 5 to 10
        title = title.strip()
        if title:
            words = title.split()[:3]
            if words:
                search_queries.append(' '.join(words))
    
    # 3. For logged in users, add their interest tags
    if current_user:
        try:
            user_profile_text = await recommendation_service.get_user_profile_text(db, current_user.id, None)
            if user_profile_text:
                for part in user_profile_text.split(',')[:3]:
                    if ':' in part:
                        tag = part.split(':')[0].strip()
                        if tag:
                            search_queries.append(tag)
        except Exception as e:
            print(f"[FEED] Failed to get user profile: {e}")
    
    # Remove duplicates while preserving order
    seen_queries = set()
    unique_queries = []
    for q in search_queries:
        q_lower = q.lower()
        if q_lower not in seen_queries and len(q) > 2:
            seen_queries.add(q_lower)
            unique_queries.append(q)
    
    search_queries = unique_queries[:6 + page * 2]  # page 0: 6, page 1: 8, page 2: 10...

    # Cold-start: no personalization signal (new user / empty history / anonymous).
    # Use a few generic seed topics so we still surface varied content.
    if not search_queries:
        search_queries = ["音樂 排行榜", "熱門 遊戲", "新聞 時事"]
        print(f"[FEED] No personalization signal, using seed queries: {search_queries}")
    print(f"[FEED] Using search queries: {search_queries}")
    
    # Search for videos based on interests
    for query in search_queries:
        try:
            print(f"[FEED] Searching yt-dlp for: {query}")
            results = await ytdlp_service.search(query, max_results=15)
            print(f"[FEED] yt-dlp returned {len(results)} results for '{query}'")
            
            for r in results:
                vid = r.get('id') or r.get('video_id')
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    all_videos.append(r)
                    if len(all_videos) >= limit * 10:  # Collect more for pagination
                        break
        except Exception as se:
            print(f"[FEED] yt-dlp search failed for '{query}': {se}")
        
        if len(all_videos) >= limit * 10:
            break

    # Cold-start / low-result fallback: blend in trending so the feed is never
    # blank (fixes empty "為您推薦" for new users). Invidious trending is a single
    # fast call and complements the yt-dlp search results.
    if len(all_videos) < limit * 2:
        try:
            from services.invidious_service import invidious_service
            trending = await invidious_service.get_trending('TW')
            for r in trending:
                vid = r.get('id') or r.get('video_id')
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    all_videos.append(r)
            print(f"[FEED] Added trending fallback, total now {len(all_videos)}")
        except Exception as te:
            print(f"[FEED] Trending fallback failed: {te}")

    # Shuffle for variety and apply pagination
    random.seed(page * 12345)
    random.shuffle(all_videos)
    
    start_idx = page * limit
    end_idx = start_idx + limit
    paged_items = all_videos[start_idx:end_idx]
    
    # Pagination
    has_next = len(all_videos) > end_idx
    next_cursor = str(page + 1) if has_next else None
    
    total_time = time.time() - start_time
    print(f"[FEED] Returning {len(paged_items)} items, page={page}, has_next={has_next}, time={total_time:.2f}s")
    
    response_data = {
        "items": paged_items,
        "next_cursor": next_cursor
    }
    
    # Cache the response — but never cache an empty page, otherwise a transient
    # blank result gets locked in for minutes even after the user gains
    # history/subscriptions.
    if paged_items:
        cache_ttl = 600 if current_user else 300
        await cache_service.set(cache_key, response_data, ttl=cache_ttl)
        print(f"[FEED] Cached for {cache_ttl}s")
    else:
        print("[FEED] Empty page, skipping cache")

    return response_data

@router.post("/sync")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """
    Manually trigger a sync for all subscriptions.
    """
    from services.cache_service import cache_service

    # Mark as running before the response is sent. BackgroundTasks only start
    # after the response, so without this the client could poll the status and
    # see a stale "done" from a previous sync.
    await cache_service.set(
        sync_status_key(current_user.id),
        {"status": "running"},
        ttl=SYNC_STATUS_TTL,
    )
    background_tasks.add_task(run_sync_task, current_user.id)
    return {"status": "Background sync started", "sync_status": "running"}


@router.get("/sync/status")
async def get_sync_status(current_user: User = Depends(get_current_user)):
    """
    Report whether the background sync for this user is still running.

    The client uses this to reload the feed only once the sync has finished
    (and therefore once the stale feed cache has been invalidated).
    """
    from services.cache_service import cache_service

    state = await cache_service.get(sync_status_key(current_user.id))
    if not isinstance(state, dict) or state.get("status") not in ("running", "done"):
        # No marker (never synced, expired, or cache unavailable) -> not running.
        return {"status": "idle"}
    return {"status": state["status"]}

@router.post("/precompute")
async def precompute_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Pre-compute recommendations for a user and store in cache.
    This can be called periodically to speed up feed requests.
    """
    from services.cache_service import cache_service
    from services.ytdlp_service import ytdlp_service
    import random
    
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required")
    
    print(f"[FEED] Pre-computing feed for user {current_user.id}")
    
    # Get watch history
    try:
        from database.models import WatchHistory
        stmt = select(WatchHistory).where(
            WatchHistory.user_id == current_user.id
        ).order_by(WatchHistory.watched_at.desc()).limit(20)
        result = await db.execute(stmt)
        history_items = result.scalars().all()
        
        watch_history_titles = [wh.video_title for wh in history_items if wh.video_title]
    except Exception as e:
        print(f"[FEED] Failed to get watch history: {e}")
        watch_history_titles = []
    
    # Extract keywords
    search_queries = []
    for title in watch_history_titles[:10]:
        title = title.strip()
        if title:
            words = title.split()[:3]
            if words:
                search_queries.append(' '.join(words))
    
    # Add interest tags
    try:
        user_profile_text = await recommendation_service.get_user_profile_text(db, current_user.id, None)
        if user_profile_text:
            for part in user_profile_text.split(',')[:3]:
                if ':' in part:
                    tag = part.split(':')[0].strip()
                    if tag:
                        search_queries.append(tag)
    except:
        pass
    
    # Deduplicate
    seen = set()
    unique_queries = []
    for q in search_queries:
        q_lower = q.lower()
        if q_lower not in seen and len(q) > 2:
            seen.add(q_lower)
            unique_queries.append(q)
    
    search_queries = unique_queries[:6]
    
    # Search and collect videos
    all_videos = []
    seen_ids = set()
    
    for query in search_queries[:3]:  # Limit to 3 queries for speed
        try:
            results = await ytdlp_service.search(query, max_results=15)
            for r in results:
                vid = r.get('id')
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    all_videos.append(r)
        except Exception as e:
            print(f"[FEED] Search failed for '{query}': {e}")
    
    # Shuffle and take 50
    random.shuffle(all_videos)
    precomputed = all_videos[:50]
    
    # Store in cache
    cache_key = f"feed:precomputed:{current_user.id}"
    await cache_service.set(cache_key, precomputed, ttl=3600)  # 1 hour
    
    print(f"[FEED] Pre-computed {len(precomputed)} videos for user {current_user.id}")
    
    return {"status": "Pre-computed", "count": len(precomputed)}

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
