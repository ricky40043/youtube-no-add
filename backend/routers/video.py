from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import RedirectResponse, StreamingResponse
from typing import Optional
from services.ytdlp_service import ytdlp_service
from services.invidious_service import invidious_service
from services.cache_service import cache_service
from config import get_settings
import asyncio
import subprocess

router = APIRouter()


@router.get("/merge")
async def merge_stream(v: Optional[str] = None, a: Optional[str] = None, id: Optional[str] = None, t: float = 0.0):
    """
    Proxy stream that merges video and audio on the fly using FFmpeg.
    Enable 1080p/720p playback without HLS/DASH manifest.
    Supports short ID to avoid URL length issues.
    Supports time-based seeking via 't' parameter.
    """
    try:
        # Resolve ID if provided
        if id:
            cached_data = await cache_service.get(f"proxy:{id}")
            if cached_data:
                v = cached_data.get('v')
                a = cached_data.get('a')
                print(f"[DEBUG] Resolved proxy ID {id} at time {t}")
            else:
                print(f"[ERROR] Proxy ID {id} not found or expired")
                raise HTTPException(status_code=404, detail="Link expired")

        if not v or not a:
             raise HTTPException(status_code=400, detail="Missing video/audio URL")

        print(f"[DEBUG] Merge request. v_len={len(v)}, a_len={len(a)}, start_time={t}")
        # FFmpeg command to merge streams and output WebM/Matroska
        # Apply -ss before both inputs for faster seeking
        cmd = [
            'ffmpeg',
            '-ss', str(t),
            '-headers', 'User-Agent: Mozilla/5.0', 
            '-i', v,
            '-ss', str(t),
            '-headers', 'User-Agent: Mozilla/5.0',
            '-i', a,
            '-c', 'copy',
            '-f', 'matroska',
            '-'
        ]
        
        # Create subprocess
        print(f"[DEBUG] Spawning ffmpeg...")
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE # Capture stderr to debug ffmpeg failures
        )
        print(f"[DEBUG] FFmpeg spawned. PID: {process.pid}")
        
        async def stream_generator():
            try:
                while True:
                    data = await process.stdout.read(32 * 1024)
                    if not data:
                        # Check if ffmpeg failed
                        if process.returncode is not None and process.returncode != 0:
                            err = await process.stderr.read()
                            print(f"[ERROR] FFmpeg failed: {err.decode()}")
                        break
                    yield data
            except Exception as e:
                print(f"[ERROR] Stream generator error: {e}")
            finally:
                if process.returncode is None:
                    try:
                        process.terminate()
                    except:
                        pass

        return StreamingResponse(stream_generator(), media_type="video/webm")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

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


@router.get("/proxy")
async def proxy_remote_content(url: str):
    """Proxy content to avoid CORS"""
    import aiohttp
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")
        
    try:
        async with aiohttp.ClientSession() as session:
             async with session.get(url) as resp:
                 if resp.status != 200:
                     raise HTTPException(status_code=resp.status, detail="Upstream error")
                 content = await resp.read()
                 return Response(content=content, media_type=resp.headers.get('Content-Type', 'text/plain'))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    
    # 3. Filter out current video
    filtered = [v for v in results if v['id'] != video_id]
    
    # If few results, try simpler query (tags or first few words)
    if len(filtered) < 5:
        # Strategy A: Use Tags
        tags = info.get("tags", [])
        if tags:
            # Take top 3 tags
            tag_query = " ".join(tags[:3])
            print(f"Retry search with tags: {tag_query}")
            # Search with tags
            tag_results = await ytdlp_service.search(tag_query, max_results=10)
            
            # Merge
            existing_ids = {v['id'] for v in filtered}
            existing_ids.add(video_id)
            
            for v in tag_results:
                if v['id'] not in existing_ids:
                    filtered.append(v)
                    existing_ids.add(v['id'])
        
        # Strategy B: If still few, use simplified title
        if len(filtered) < 5:
            # Simple tokenization: split by space and take first 5 words
            # Also remove brackets like [], 【】 etc as they might confuse search?
            import re
            # Add 『』 and ～ to regex
            clean_title = re.sub(r'[\[\]【】\(\)『』～~]', '', title)
            words = clean_title.split()
            if len(words) > 1:
                short_query = " ".join(words[:5])
                print(f"Retry search with simplified title: {short_query}")
                more_results = await ytdlp_service.search(short_query, max_results=10)
                
                # Merge and deduplicate
                existing_ids = {v['id'] for v in filtered}
                existing_ids.add(video_id)
                
                for v in more_results:
                    if v['id'] not in existing_ids:
                        filtered.append(v)
                        existing_ids.add(v['id'])
    
    # Limit to 10
    return filtered[:10]
