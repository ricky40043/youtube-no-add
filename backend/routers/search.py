from fastapi import APIRouter, Query
from services.ytdlp_service import ytdlp_service
from services.invidious_service import invidious_service
from services.cache_service import cache_service
from config import get_settings

router = APIRouter()


@router.get("")
async def search_videos(
    q: str = Query(..., description="搜尋關鍵字"),
    max_results: int = Query(20, ge=1, le=50, description="最大結果數"),
    offset: int = Query(0, ge=0, description="跳過的結果數 (分頁用)")
):
    """
    搜尋 YouTube 影片
    
    - **q**: 搜尋關鍵字
    - **max_results**: 返回的最大結果數 (1-50)
    - **offset**: 分頁偏移量
    """
    settings = get_settings()
    
    # Check cache (include offset in key)
    cache_key = f"search:{q}:{max_results}:{offset}"
    cached = await cache_service.get(cache_key)
    if cached:
        return {"results": cached}
    
    # Try yt-dlp first
    results = await ytdlp_service.search(q, max_results, offset)
    
    # Fallback to Invidious (only if offset is 0, since simple invidious service might not support offset easily via this wrapper)
    # Actually, let's just use yt-dlp for now or assume invidious interface needs update too.
    # For now, if yt-dlp fails, we try invidious only for page 1.
    if not results and offset == 0:
        results = await invidious_service.search(q, max_results)
    
    # Cache results
    if results:
        await cache_service.set(cache_key, results, ttl=settings.search_cache_ttl)
    
    return {"results": results}


@router.get("/trending")
async def get_trending(
    region: str = Query("TW", description="地區代碼 (如 TW, US, JP)")
):
    """
    獲取熱門影片
    
    - **region**: 地區代碼
    """
    # Try Invidious for trending (yt-dlp doesn't support trending directly)
    results = await invidious_service.get_trending(region)
    
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
    results = await ytdlp_service.search(q, max_results=5)
    
    # Extract unique titles as suggestions
    suggestions = list(set([
        r["title"][:50] for r in results if r.get("title")
    ]))[:5]
    
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
    import jieba
    import random
    
    # Extract keywords using jieba
    words = list(jieba.cut(q))
    # Filter meaningful words (length > 1)
    keywords = [w for w in words if len(w) > 1]
    
    if not keywords:
        return {"results": []}
    
    # Use different keyword combinations for more diversity
    # Try different subsets of keywords
    all_results = []
    keyword_subsets = [
        keywords[:3],  # First 3 keywords
        keywords[-3:] if len(keywords) >= 3 else keywords,  # Last 3 keywords
        keywords[::2] if len(keywords) > 2 else keywords,  # Every other keyword
    ]
    
    for kw_subset in keyword_subsets:
        if not kw_subset:
            continue
        query = " ".join(kw_subset)
        try:
            results = await ytdlp_service.search(query, max_results=30)
            all_results.extend(results)
        except Exception as e:
            print(f"[Search Related] Search failed for query '{query}': {e}")
    
    # Remove duplicates by id
    seen_ids = set()
    unique_results = []
    for video in all_results:
        vid = video.get('id')
        if vid and vid not in seen_ids:
            seen_ids.add(vid)
            unique_results.append(video)
    
    # Shuffle for randomness
    random.shuffle(unique_results)
    
    return {"results": unique_results[offset:offset + limit]}
