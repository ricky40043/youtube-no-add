from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import asyncio
import json
import re
import jieba
from services.ytdlp_service import ytdlp_service
from services.invidious_service import invidious_service
from services.cache_service import cache_service
from config import get_settings

router = APIRouter()


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stream_search_batches(q: str, sort: str = "relevance"):
    """Yield search results in batches, up to fifty items."""
    settings = get_settings()
    full_key = f"search:full:{q}:{sort}"
    cached = await cache_service.get(full_key)
    accumulated = []
    seen = set()

    if cached:
        cached_batch = []
        for video in cached[:50]:
            video_id = video.get("id")
            if video_id and video_id not in seen:
                seen.add(video_id)
                accumulated.append(video)
                cached_batch.append(video)
                if len(cached_batch) >= 10:
                    yield _sse("batch", {"results": cached_batch, "count": len(accumulated), "done": len(accumulated) >= len(cached[:50])})
                    cached_batch = []
        if cached_batch:
            yield _sse("batch", {"results": cached_batch, "count": len(accumulated), "done": True})
        yield _sse("complete", {"count": len(accumulated), "cached": True})
        return

    # Single fast flat search (fetching up to 50 results in 1 yt-dlp run)
    results = await ytdlp_service.search(q, max_results=50, offset=0, sort=sort)
    if not results:
        results = await invidious_service.search(q, 50)

    if results:
        for video in results:
            video_id = video.get("id")
            if video_id and video_id not in seen:
                seen.add(video_id)
                accumulated.append(video)

        # Cache full results
        await cache_service.set(full_key, accumulated[:50], ttl=settings.search_cache_ttl)

        # Stream batches quickly to client
        batch_size = 10
        for i in range(0, len(accumulated), batch_size):
            chunk = accumulated[i:i + batch_size]
            is_done = (i + batch_size) >= len(accumulated)
            yield _sse("batch", {"results": chunk, "count": min(i + batch_size, len(accumulated)), "done": is_done})
            await asyncio.sleep(0.01)

    yield _sse("complete", {"count": len(accumulated), "cached": False})


@router.get("/stream")
async def stream_search_videos(
    q: str = Query(..., description="搜尋關鍵字"),
    sort: str = Query("relevance", description="排序: relevance / date / views"),
):
    return StreamingResponse(
        _stream_search_batches(q, sort),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("")
async def search_videos(
    q: str = Query(..., description="搜尋關鍵字"),
    max_results: int = Query(20, ge=1, le=50, description="最大結果數"),
    offset: int = Query(0, ge=0, description="跳過的結果數 (分頁用)"),
    sort: str = Query("relevance", description="排序: relevance / date / views")
):
    """
    搜尋 YouTube 影片

    - **q**: 搜尋關鍵字
    - **max_results**: 返回的最大結果數 (1-50)
    - **offset**: 分頁偏移量
    - **sort**: 排序方式 (relevance 預設 / date / views)
    """
    settings = get_settings()

    # Fetch a larger result set ONCE and cache it, then paginate in-memory.
    # This avoids re-running ytsearch on every scroll (slow + duplicate/drift),
    # and keeps pagination stable for the lifetime of the cache entry.
    FULL_SIZE = 50
    full_key = f"search:full:{q}:{sort}"
    full = await cache_service.get(full_key)

    if full is None:
        full = await ytdlp_service.search(q, max_results=FULL_SIZE, offset=0, sort=sort)
        # Fallback to Invidious if yt-dlp returned nothing
        if not full:
            full = await invidious_service.search(q, FULL_SIZE)
        if full:
            await cache_service.set(full_key, full, ttl=settings.search_cache_ttl)

    page = full[offset:offset + max_results] if full else []
    return {"results": page}


@router.get("/trending")
async def get_trending(
    region: str = Query("TW", description="地區代碼 (如 TW, US, JP)")
):
    """
    獲取熱門影片
    
    - **region**: 地區代碼
    """
    from services.cache_service import cache_service
    
    # Check cache first (30 minutes)
    cache_key = f"trending:{region}"
    cached = await cache_service.get(cache_key)
    if cached:
        return {"results": cached}
    
    # Try Invidious for trending (yt-dlp doesn't support trending directly)
    results = await invidious_service.get_trending(region)
    
    # Cache for 30 minutes
    if results:
        await cache_service.set(cache_key, results, ttl=1800)
    
    return {"results": results}


@router.get("/suggestions")
async def get_suggestions(
    q: str = Query(..., description="搜尋關鍵字")
):
    """
    獲取搜尋建議（自動完成）
    
    - **q**: 部分關鍵字
    """
    # Search with limited results for suggestions
    results = await ytdlp_service.search(q, max_results=8)

    # Dedupe while preserving relevance order; keep fuller titles
    seen = set()
    suggestions = []
    for r in results:
        title = (r.get("title") or "").strip()
        if not title:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        suggestions.append(title[:60])
        if len(suggestions) >= 8:
            break

    return {"suggestions": suggestions}


@router.get("/related")
async def get_search_related(
    q: str = Query(..., description="搜尋關鍵字"),
    limit: int = Query(10, ge=1, le=20, description="推薦數量"),
    offset: int = Query(0, ge=0, description="分頁偏移")
):
    """
    獲取搜尋關聯推薦（基於關鍵字擴展）
    
    - **q**: 原始搜尋關鍵字
    - **limit**: 返回的推薦數量
    - **offset**: 分頁偏移
    """
    # Fast keyword extraction
    cleaned_q = re.sub(r'[^\w\s\u4e00-\u9fff]', ' ', q).strip()
    words = [w.strip() for w in jieba.cut(cleaned_q) if len(w.strip()) > 1]
    if not words:
        words = cleaned_q.split()

    if not words:
        return {"results": []}

    cache_key = f"search:related:{q}"
    cached = await cache_service.get(cache_key)
    if cached is not None:
        return {"results": cached[offset:offset + limit]}

    # Build focused search queries (at most 1-2 targeted searches)
    search_query = " ".join(words[:4])
    all_results = []
    try:
        results = await ytdlp_service.search(search_query, max_results=30)
        all_results.extend(results)
    except Exception as e:
        print(f"[Search Related] Search failed for query '{search_query}': {e}")

    # Remove duplicates by id
    seen_ids = set()
    unique_results = []
    for video in all_results:
        vid = video.get('id')
        if vid and vid not in seen_ids:
            seen_ids.add(vid)
            unique_results.append(video)

    keyword_set = set(k.lower() for k in words)

    def _title_tokens(t):
        cleaned = re.sub(r'[\[\]【】\(\)『』～~「」《》#|\-_]', ' ', (t or '').lower())
        return set(w for w in cleaned.split() if len(w) > 1)

    for v in unique_results:
        overlap = len(_title_tokens(v.get('title')) & keyword_set)
        view_count = v.get('view_count') or 0
        v['_score'] = overlap + min(view_count / 1_000_000, 1.0) * 0.3
    unique_results.sort(key=lambda v: -v.get('_score', 0))
    for v in unique_results:
        v.pop('_score', None)

    # Cache for 10 minutes
    if unique_results:
        await cache_service.set(cache_key, unique_results, ttl=600)

    return {"results": unique_results[offset:offset + limit]}
