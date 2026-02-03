from fastapi import APIRouter, Query
from services.ytdlp_service import ytdlp_service
from services.invidious_service import invidious_service
from services.cache_service import cache_service
from config import get_settings

router = APIRouter()


@router.get("")
async def search_videos(
    q: str = Query(..., description="搜尋關鍵字"),
    max_results: int = Query(20, ge=1, le=50, description="最大結果數")
):
    """
    搜尋 YouTube 影片
    
    - **q**: 搜尋關鍵字
    - **max_results**: 返回的最大結果數 (1-50)
    """
    settings = get_settings()
    
    # Check cache
    cache_key = cache_service.search_key(q)
    cached = await cache_service.get(cache_key)
    if cached:
        return {"results": cached[:max_results]}
    
    # Try yt-dlp first
    results = await ytdlp_service.search(q, max_results)
    
    # Fallback to Invidious
    if not results:
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
