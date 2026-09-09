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
        cached_data = {}
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
        
        # Use Standard fMP4 for all clients (Restoring stable state)
        output_format = 'mp4'
        media_type = 'video/mp4'
        movflags = ['-movflags', 'frag_keyframe+empty_moov+default_base_moof']

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
            # Force yuv420p and main profile for Safari/iOS support
            cmd += ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'main']
        else:
            # Already H.264, just copy (zero CPU)
            cmd += ['-c:v', 'copy']

        cmd += [
            '-c:a', 'aac',  # Ensure audio is AAC
            '-b:a', '192k',
            '-f', output_format,
        ]
        
        if movflags:
            cmd += movflags
            
        cmd.append('-')
        
        # Create subprocess
        print(f"[DEBUG] Spawning ffmpeg... Output: {output_format}")
        # print(f"[DEBUG] Command: {' '.join(cmd)}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE # Capture stderr
        )
        print(f"[DEBUG] FFmpeg spawned. PID: {process.pid}")
        
        async def stream_generator():
            try:
                while True:
                    data = await process.stdout.read(32 * 1024)
                    if not data:
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

        return StreamingResponse(stream_generator(), media_type=media_type)
    except HTTPException as ie:
        raise ie
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(content=f"Internal Server Error: {str(e)}", status_code=500)

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


@router.get("/audio/{video_id}/stream")
async def stream_audio(video_id: str, request: Request):
    """Proxy the current YouTube audio stream to the browser.

    YouTube media URLs are short-lived and direct browser requests can also
    fail because of CORS or missing byte-range handling.  Resolve a fresh URL
    for every request and keep the browser on our own origin.
    """
    import httpx

    url = await ytdlp_service.get_audio_stream_url(video_id)
    if not url:
        info = await invidious_service.get_video_info(video_id)
        audio_streams = (info or {}).get("streams", [])
        url = next((s.get("url") for s in audio_streams
                    if s.get("type") == "audio" and s.get("url")), None)

    if not url:
        raise HTTPException(status_code=404, detail="Audio stream not found")

    headers = {}
    if range_header := request.headers.get("range"):
        headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=None, follow_redirects=True)
    try:
        upstream = await client.send(
            client.build_request("GET", url, headers=headers), stream=True
        )
        if upstream.status_code >= 400:
            await upstream.aclose()
            await client.aclose()
            raise HTTPException(status_code=upstream.status_code,
                                detail="YouTube audio stream unavailable")

        response_headers = {
            "Accept-Ranges": "bytes",
            # The signed upstream URL is refreshed per request; never cache
            # this stable local endpoint with stale media behind it.
            "Cache-Control": "no-store",
        }
        for name in ("content-length", "content-range", "etag", "last-modified"):
            if value := upstream.headers.get(name):
                response_headers[name.title()] = value

        async def audio_generator():
            try:
                async for chunk in upstream.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            audio_generator(),
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type", "audio/mp4"),
            headers=response_headers,
        )
    except HTTPException:
        raise
    except Exception:
        await client.aclose()
        raise


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
async def get_related_videos(video_id: str, offset: int = 0, limit: int = 20):
    """
    獲取相關影片（基於中文斷詞與語意主題推薦）
    
    - **video_id**: YouTube 影片 ID
    - **offset**: 分頁偏移量
    - **limit**: 每次回傳數量
    """
    import re
    import jieba

    full_cache_key = f"related:{video_id}:full"
    full_cached = await cache_service.get(full_cache_key)
    if full_cached and isinstance(full_cached, list):
        final = full_cached[offset:offset + limit]
        return {
            "items": final,
            "total": len(full_cached),
            "next_offset": offset + limit if offset + limit < len(full_cached) else None
        }

    # 1. 取得原影片資訊
    try:
        info = await get_video_info(video_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Original video not found")

    title = (info.get("title") or "").strip()
    author = (info.get("author") or "").strip()
    channel_id = info.get("channel_id") or info.get("author_id", "")
    tags = [t.strip() for t in (info.get("tags") or []) if t and len(t.strip()) > 1]
    categories = info.get("categories", []) or []

    if not title:
        raise HTTPException(status_code=404, detail="Video title not found")

    # 2. 中文智慧分詞與主題關鍵字提取
    cleaned_title = re.sub(r'[\[\]【】\(\)『』～~「」《》#|\-_,.!?！？、。:：/\s+]', ' ', title).strip()
    stop_words = {
        '谁才是', '竟已是', '为什么', '怎么办', '到底', '什么', '如何', '一个', '这是一', 
        '这个', '那个', '这是', '那些', '有些', '就是', '不是', '其实', '竟然', '原来',
        '最新消息', '曝光', '盘点', '合集', '真的', '来看', '视频', '解说', '完整版'
    }
    raw_words = [w.strip() for w in jieba.cut(cleaned_title) if len(w.strip()) > 1]
    meaningful_words = [w for w in raw_words if w not in stop_words and not w.isdigit()]

    if not meaningful_words:
        meaningful_words = [w for w in raw_words if not w.isdigit()]

    # 建立主題關鍵字指紋
    base_keywords_set = set(w.lower() for w in meaningful_words) | set(t.lower() for t in tags[:8])

    # 3. 構建並行搜尋策略
    queries = []
    # 策略 A: 核心主題詞組 (前 3~4 個詞)
    if meaningful_words:
        queries.append(" ".join(meaningful_words[:4]))
    # 策略 B: 最重要關鍵名詞 (前 2 個詞)
    if len(meaningful_words) >= 2:
        queries.append(" ".join(meaningful_words[:2]))
    # 策略 C: 標題前半部
    if len(cleaned_title) > 4:
        queries.append(cleaned_title[:25])
    # 策略 D: 標籤組
    if tags:
        queries.append(" ".join(tags[:3]))

    # 去除重複查詢
    unique_queries = []
    seen_q = set()
    for q in queries:
        q_clean = q.strip()
        if q_clean and q_clean not in seen_q:
            seen_q.add(q_clean)
            unique_queries.append(q_clean)

    # 並行發起搜尋
    search_tasks = [ytdlp_service.search(q, max_results=20) for q in unique_queries]
    raw_results = await asyncio.gather(*search_tasks, return_exceptions=True)

    # 4. 去重與相關度打分 (Relevance Scoring)
    seen_ids = {video_id}
    merged = []
    same_channel_count = 0
    SAME_CHANNEL_MAX = 2  # 同頻道最多只保留 2 部且須具備關聯

    def _calc_relevance(cand_title: str) -> float:
        cleaned = re.sub(r'[\[\]【】\(\)『』～~「」《》#|\-_,.!?！？、。:：/\s+]', ' ', (cand_title or '')).strip()
        cand_words = set(w.strip().lower() for w in jieba.cut(cleaned) if len(w.strip()) > 1)
        overlap = len(cand_words & base_keywords_set)
        return overlap / max(len(base_keywords_set), 1) if base_keywords_set else 0

    for batch in raw_results:
        if isinstance(batch, Exception) or not isinstance(batch, list):
            continue

        for video in batch:
            vid = video.get('id')
            if not vid or vid in seen_ids:
                continue

            v_title = video.get('title') or ''
            relevance = _calc_relevance(v_title)

            # 檢查是否同頻道
            is_same_channel = (
                (video.get('channel_id') and video.get('channel_id') == channel_id)
                or (author and video.get('author') == author)
            )

            # 同頻道若無主題關聯性且已超過限制則跳過
            if is_same_channel:
                if same_channel_count >= SAME_CHANNEL_MAX or relevance < 0.15:
                    continue
                same_channel_count += 1

            view_count = video.get('view_count') or 0
            view_bonus = min(view_count / 1_000_000, 1.0) * 0.15
            score = relevance * 2.0 + view_bonus

            seen_ids.add(vid)
            video['_score'] = score
            merged.append(video)

    # 依相關度排序
    merged.sort(key=lambda v: -v.get('_score', 0))

    # 5. 若結果不足 15 筆，以更廣泛的主題詞搜尋補齊
    if len(merged) < 15 and meaningful_words:
        try:
            fallback_query = meaningful_words[0]
            fallback_batch = await ytdlp_service.search(fallback_query, max_results=20)
            for video in fallback_batch:
                vid = video.get('id')
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    merged.append(video)
                    if len(merged) >= 25:
                        break
        except Exception as e:
            print(f"[Related] Fallback search failed: {e}")

    # 清理內部評分欄位
    for v in merged:
        v.pop('_score', None)

    # 寫入快取 10 分鐘
    await cache_service.set(full_cache_key, merged, ttl=600)

    final = merged[offset:offset + limit]
    return {
        "items": final,
        "total": len(merged),
        "next_offset": offset + limit if offset + limit < len(merged) else None
    }
