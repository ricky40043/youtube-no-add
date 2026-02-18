from fastapi import APIRouter, HTTPException, Response, Request
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
async def merge_stream(request: Request, v: Optional[str] = None, a: Optional[str] = None, id: Optional[str] = None, t: float = 0.0):
    """
    Proxy stream that merges video and audio on the fly using FFmpeg.
    Enable 1080p/720p playback without HLS/DASH manifest.
    Supports short ID to avoid URL length issues.
    Supports time-based seeking via 't' parameter.
    """
    try:
        # Resolve ID if provided
        vcodec = None
        if id:
            cached_data = await cache_service.get(f"proxy:{id}")
            if cached_data:
                v = cached_data.get('v')
                a = cached_data.get('a')
                vcodec = cached_data.get('vcodec', '')
                print(f"[DEBUG] Resolved proxy ID {id} at time {t}, vcodec={vcodec}")
            else:
                print(f"[ERROR] Proxy ID {id} not found or expired")
                raise HTTPException(status_code=404, detail="Link expired")

        # Check if direct proxy (Single file, no merge needed)
        proxy_type = cached_data.get('type', 'merge')
        
        if proxy_type == 'direct':
            direct_url = cached_data.get('url')
            if not direct_url:
                raise HTTPException(status_code=404, detail="Direct URL missing")
            
            # Simple Proxy for Direct MP4 with Range Support
            import httpx
            
            # Extract Range header from client request
            range_header = request.headers.get('Range')
            headers = {}
            if range_header:
                headers['Range'] = range_header
                print(f"[DEBUG] Forwarding Range header: {range_header}")
            
            # Use httpx for streaming (already in requirements)
            client = httpx.AsyncClient()
            
            try:
                # Upstream request with Range header
                # We use stream=True for the GET request
                req = client.build_request("GET", direct_url, headers=headers)
                upstream_resp = await client.send(req, stream=True)
                
                if upstream_resp.status_code >= 400:
                    print(f"[ERROR] Upstream returned {upstream_resp.status_code}")
                    await client.aclose()
                    return Response(status_code=upstream_resp.status_code)
                
                # Forward response headers
                resp_headers = {
                    "Accept-Ranges": "bytes",
                    "Content-Type": upstream_resp.headers.get("Content-Type", "video/mp4"),
                }
                
                if 'Content-Length' in upstream_resp.headers:
                    resp_headers['Content-Length'] = upstream_resp.headers['Content-Length']
                if 'Content-Range' in upstream_resp.headers:
                    resp_headers['Content-Range'] = upstream_resp.headers['Content-Range']
                    
                async def direct_stream_generator():
                    try:
                        async for chunk in upstream_resp.aiter_bytes(chunk_size=32 * 1024):
                            yield chunk
                    except Exception as e:
                        print(f"[ERROR] Stream generator error: {e}")
                    finally:
                        await upstream_resp.aclose()
                        await client.aclose()

                return StreamingResponse(
                    direct_stream_generator(), 
                    status_code=upstream_resp.status_code, # 206 Partial Content or 200 OK
                    media_type="video/mp4",
                    headers=resp_headers
                )
            except Exception as e:
                await client.aclose()
                print(f"[ERROR] Direct stream error: {e}")
                raise e

        if not v or not a:
             raise HTTPException(status_code=400, detail="Missing video/audio URL")

        # Smart transcoding: if source is H.264 (avc1), copy directly (fast).
        # If source is VP9/AV1, transcode to H.264 so iOS/Safari can play it.
        need_transcode = not (vcodec and vcodec.startswith('avc1'))
        print(f"[DEBUG] Merge request. v_len={len(v)}, a_len={len(a)}, start_time={t}, vcodec={vcodec}, transcode={need_transcode}")

        # Build FFmpeg command
        cmd = [
            'ffmpeg',
            '-ss', str(t),
            '-headers', 'User-Agent: Mozilla/5.0', 
            '-i', v,
            '-ss', str(t),
            '-headers', 'User-Agent: Mozilla/5.0',
            '-i', a,
        ]

        if need_transcode:
            # Transcode VP9/AV1 → H.264 for universal compatibility
            # Force yuv420p and main profile for Safari/iOS
            cmd += ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'main']
        else:
            # Already H.264, just copy (zero CPU)
            cmd += ['-c:v', 'copy']

        cmd += [
            '-c:a', 'aac',  # Ensure audio is AAC
            '-b:a', '192k',
            '-f', 'mp4',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof', # Required for streaming MP4
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

        return StreamingResponse(stream_generator(), media_type="video/mp4")
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
    獲取相關影片（多策略並行推薦）
    
    策略：同頻道、Tags、分類+關鍵字、作者名、清洗標題
    並行搜尋後去重合併，回傳最多 20 部
    
    - **video_id**: YouTube 影片 ID
    """
    import re
    
    # Check cache first
    cache_key = f"related:{video_id}"
    cached = await cache_service.get(cache_key)
    if cached:
        print(f"[Related] Cache hit for {video_id}")
        return cached
    
    # 1. Get video info
    try:
        info = await get_video_info(video_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Original video not found")
        
    title = info.get("title", "")
    author = info.get("author", "")
    channel_id = info.get("channel_id") or info.get("author_id", "")
    tags = info.get("tags", []) or []
    categories = info.get("categories", []) or []
    
    if not title:
        raise HTTPException(status_code=404, detail="Video title not found")
    
    # --- Build search strategies (all run in parallel) ---
    
    async def strategy_channel():
        """策略1: 同頻道其他影片"""
        if not channel_id:
            return []
        try:
            results = await ytdlp_service.get_channel_latest_videos(channel_id, limit=8)
            print(f"[Related] Channel strategy: {len(results)} results")
            return results
        except Exception as e:
            print(f"[Related] Channel strategy failed: {e}")
            return []
    
    async def strategy_tags():
        """策略2: 用 Tags 搜尋相似主題"""
        if not tags:
            return []
        try:
            tag_query = " ".join(tags[:5])
            results = await ytdlp_service.search(tag_query, max_results=8)
            print(f"[Related] Tags strategy: {len(results)} results (query: {tag_query[:50]})")
            return results
        except Exception as e:
            print(f"[Related] Tags strategy failed: {e}")
            return []
    
    async def strategy_category():
        """策略3: 分類 + 標題關鍵字"""
        # Clean title: remove brackets, special chars
        clean = re.sub(r'[\[\]【】\(\)『』～~「」《》#|\-_]', ' ', title)
        words = [w for w in clean.split() if len(w) > 1]
        keywords = " ".join(words[:3])
        
        if categories:
            query = f"{categories[0]} {keywords}"
        else:
            query = keywords
        
        if not query.strip():
            return []
        try:
            results = await ytdlp_service.search(query, max_results=8)
            print(f"[Related] Category strategy: {len(results)} results (query: {query[:50]})")
            return results
        except Exception as e:
            print(f"[Related] Category strategy failed: {e}")
            return []
    
    async def strategy_author():
        """策略4: 搜尋同作者/YouTuber"""
        if not author:
            return []
        try:
            results = await ytdlp_service.search(author, max_results=6)
            print(f"[Related] Author strategy: {len(results)} results (author: {author})")
            return results
        except Exception as e:
            print(f"[Related] Author strategy failed: {e}")
            return []
    
    async def strategy_clean_title():
        """策略5: 清洗標題後搜尋"""
        clean = re.sub(r'[\[\]【】\(\)『』～~「」《》#|\-_]', ' ', title)
        words = [w for w in clean.split() if len(w) > 1]
        if len(words) <= 1:
            return []
        query = " ".join(words[:5])
        try:
            results = await ytdlp_service.search(query, max_results=8)
            print(f"[Related] Clean title strategy: {len(results)} results (query: {query[:50]})")
            return results
        except Exception as e:
            print(f"[Related] Clean title strategy failed: {e}")
            return []
    
    # 2. Run selected strategies in parallel (Reduced to avoid rate limiting)
    results = await asyncio.gather(
        strategy_channel(),
        strategy_clean_title(),
        return_exceptions=True
    )
    
    # 3. Merge results with priority
    seen_ids = {video_id}  # exclude current video
    merged = []
    
    strategy_names = ["channel", "clean_title"]
    
    for idx, batch in enumerate(results):
        if isinstance(batch, Exception):
            print(f"[Related] Strategy {strategy_names[idx]} raised: {batch}")
            continue
        if not isinstance(batch, list):
            continue
        for video in batch:
            vid = video.get('id')
            if vid and vid not in seen_ids:
                seen_ids.add(vid)
                video['_source'] = strategy_names[idx]
                merged.append(video)
    
    # 4. Sort: prioritize by source strategy order, then by view_count desc
    priority_map = {name: i for i, name in enumerate(strategy_names)}
    merged.sort(key=lambda v: (
        priority_map.get(v.get('_source', ''), 99),
        -(v.get('view_count') or 0)
    ))
    
    # Remove internal _source field before returning
    for v in merged:
        v.pop('_source', None)
    
    final = merged[:20]
    print(f"[Related] Final: {len(final)} related videos for {video_id}")
    
    # 5. Cache for 10 minutes
    await cache_service.set(cache_key, final, ttl=600)
    
    return final
