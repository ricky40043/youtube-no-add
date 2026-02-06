from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from services.ytdlp_service import ytdlp_service
from services.invidious_service import invidious_service
from services.cache_service import cache_service
from config import get_settings

router = APIRouter()


@router.get("/info/{video_id}")
async def get_video_info(video_id: str):
    """
    獲取影片資訊
    
    - **video_id**: YouTube 影片 ID 或完整 URL
    """
    settings = get_settings()
    
    # Check cache first
    cache_key = cache_service.video_key(video_id)
    cached = await cache_service.get(cache_key)
    if cached:
        return cached
    
    # Try yt-dlp first
    info = await ytdlp_service.get_video_info(video_id)
    
    # Fallback to Invidious if yt-dlp fails
    if not info:
        info = await invidious_service.get_video_info(video_id)
    
    if not info:
        raise HTTPException(status_code=404, detail="Video not found or unavailable")
    
    # Cache the result
    await cache_service.set(cache_key, info, ttl=settings.video_cache_ttl)
    
    return info


@router.get("/stream/{video_id}")
async def get_stream_url(video_id: str, quality: str = "audio"):
    """
    獲取串流 URL（重定向到實際串流）
    
    - **video_id**: YouTube 影片 ID
    - **quality**: 'audio' 用於背景播放，或 '720p', '1080p' 等
    """
    info = await ytdlp_service.get_video_info(video_id)
    
    if not info:
        info = await invidious_service.get_video_info(video_id)
    
    if not info or not info.get("streams"):
        raise HTTPException(status_code=404, detail="Stream not found")
    
    streams = info["streams"]
    
    # Find matching stream
    if quality == "audio":
        # Find audio-only stream
        audio_streams = [s for s in streams if s.get("type") == "audio"]
        if audio_streams:
            return RedirectResponse(url=audio_streams[0]["url"])
    
    # Find video stream with requested quality
    for stream in streams:
        if stream.get("quality") == quality:
            return RedirectResponse(url=stream["url"])
    
    # Fallback to first available stream
    if streams:
        return RedirectResponse(url=streams[0]["url"])
    
    raise HTTPException(status_code=404, detail="No suitable stream found")


@router.get("/audio/{video_id}")
async def get_audio_url(video_id: str):
    """
    獲取純音訊串流 URL（用於背景播放）
    
    - **video_id**: YouTube 影片 ID
    """
    url = await ytdlp_service.get_audio_stream_url(video_id)
    
    if not url:
        # Fallback to Invidious
        info = await invidious_service.get_video_info(video_id)
        if info and info.get("streams"):
            audio_streams = [s for s in info["streams"] if s.get("type") == "audio"]
            if audio_streams:
                url = audio_streams[0]["url"]
    
    
    if not url:
        raise HTTPException(status_code=404, detail="Audio stream not found")
    
    return {"url": url}


@router.get("/related/{video_id}")
async def get_related_videos(video_id: str):
    """
    獲取相關影片（透過標題搜尋模擬）
    
    - **video_id**: YouTube 影片 ID
    """
    # 1. Get video info to find title
    # We use get_video_info which handles caching
    try:
        info = await get_video_info(video_id)
    except Exception:
        # If video not found, can't find related
        raise HTTPException(status_code=404, detail="Original video not found")
        
    title = info.get("title")
    if not title:
         raise HTTPException(status_code=404, detail="Video title not found")
         
    # 2. Search for videos with similar title
    # Try full title first
    results = await ytdlp_service.search(title, max_results=10)
    
    # If no results, try simpler query (first few words)
    if not results:
        # Simple tokenization: split by space and take first 5 words
        # Also remove brackets like [], 【】 etc as they might confuse search?
        import re
        clean_title = re.sub(r'[\[\]【】\(\)]', '', title)
        words = clean_title.split()
        if len(words) > 1:
            short_query = " ".join(words[:5])
            print(f"Retry search with: {short_query}")
            results = await ytdlp_service.search(short_query, max_results=10)
    
    # 3. Filter out current video and return
    filtered = [v for v in results if v['id'] != video_id]
    
    # Limit to 10
    return filtered[:10]
