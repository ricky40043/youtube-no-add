import asyncio
from typing import Any, Dict

import httpx
from fastapi import HTTPException

from services.cache_service import cache_service
from services.ytdlp_service import ytdlp_service
from services.youtube_url import extract_youtube_video_id


class VideoMetadataService:
    """Cache card metadata separately from playback URLs and share lookups."""

    def __init__(self):
        self._pending = {}

    async def get(self, value: str) -> Dict[str, Any]:
        video_id = extract_youtube_video_id(value)
        if not video_id:
            raise HTTPException(400, '無效的 YouTube 影片網址或 ID')
        key = f'video:metadata:{video_id}'
        cached = await cache_service.get(key)
        if cached:
            return cached
        if video_id not in self._pending:
            self._pending[video_id] = asyncio.create_task(self._fetch(video_id, key))
            def completed(task):
                self._pending.pop(video_id, None)
                if not task.cancelled():
                    task.exception()  # Observe errors even if every client disconnected.
            self._pending[video_id].add_done_callback(completed)
        return await asyncio.shield(self._pending[video_id])

    async def _fetch(self, video_id: str, key: str) -> Dict[str, Any]:
        try:
            info = await asyncio.wait_for(ytdlp_service.get_video_metadata(video_id), timeout=6)
        except (asyncio.TimeoutError, OSError) as exc:
            print(f'[ERROR] Metadata lookup {video_id}: {exc}')
            info = None

        if not info or not info.get('title'):
            # oEmbed can still resolve an available video when format extraction
            # is blocked. It provides no duration; do not invent one.
            try:
                async with httpx.AsyncClient(timeout=3) as client:
                    response = await client.get('https://www.youtube.com/oembed', params={
                        'url': f'https://www.youtube.com/watch?v={video_id}', 'format': 'json',
                    })
                    if response.status_code in (401, 404):
                        raise HTTPException(404, '找不到這部影片，可能已下架或設為私人')
                    response.raise_for_status()
                    data = response.json()
                    info = {
                        'id': video_id, 'title': data['title'], 'author': data.get('author_name'),
                        'thumbnail': data.get('thumbnail_url'), 'duration': None,
                    }
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                print(f'[ERROR] oEmbed lookup {video_id}: {exc}')
                raise HTTPException(503, '暫時無法取得影片資訊，請稍後重試') from exc

        ttl = 60 if not info.get('duration') or info.get('is_live') else 1800
        await cache_service.set(key, info, ttl=ttl)
        return info


video_metadata_service = VideoMetadataService()
