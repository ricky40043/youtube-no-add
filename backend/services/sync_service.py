import logging
from datetime import datetime
import re
from typing import List, Optional
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_settings
from database.models import Channel, Video
from .ytdlp_service import ytdlp_service

logger = logging.getLogger(__name__)

def parse_duration(pt_duration: str) -> int:
    """Parses YouTube ISO 8601 duration to seconds."""
    pattern = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')
    match = pattern.match(pt_duration)
    if not match:
        return 0
    return int(match.group(1) or 0) * 3600 + int(match.group(2) or 0) * 60 + int(match.group(3) or 0)

class SyncService:
    def __init__(self):
        self.settings = get_settings()
        self._youtube = None

    @property
    def youtube(self):
        if not self._youtube and self.settings.youtube_api_key:
            self._youtube = build('youtube', 'v3', developerKey=self.settings.youtube_api_key)
        return self._youtube

    async def sync_channel_uploads(self, db: AsyncSession, channel_id: str, limit: int = 50):
        """
        Syncs the latest uploads for a given channel.
        Automatic fallback to yt-dlp if API Key is missing or quota exceeded.
        """
        use_ytdlp = False
        
        # Determine mode
        if not self.youtube:
            logger.info("YouTube API Key not configured. Using yt-dlp fallback.")
            use_ytdlp = True
            
        # 1. Get or create Channel entry
        stmt = select(Channel).where(Channel.id == channel_id)
        result = await db.execute(stmt)
        channel = result.scalar_one_or_none()

        if use_ytdlp:
            await self._sync_channel_ytdlp(db, channel_id, channel, limit)
            return

        try:
            # API Mode
            logger.info(f"Starting API sync for channel: {channel_id}")
            
            if not channel:
                # Fetch channel info via API
                request = self.youtube.channels().list(part="snippet,contentDetails", id=channel_id)
                response = request.execute()
                
                if not response['items']:
                    logger.warning(f"Channel {channel_id} not found on YouTube API.")
                    return

                item = response['items'][0]
                uploads_id = item['contentDetails']['relatedPlaylists']['uploads']
                
                channel = Channel(
                    id=channel_id,
                    title=item['snippet']['title'],
                    thumbnail_url=item['snippet']['thumbnails'].get('default', {}).get('url'),
                    uploads_playlist_id=uploads_id,
                    last_fetched_at=datetime.utcnow()
                )
                db.add(channel)
                await db.commit()
                await db.refresh(channel)
            
            # Fetch videos via API
            request = self.youtube.playlistItems().list(
                part="snippet,contentDetails",
                playlistId=channel.uploads_playlist_id,
                maxResults=limit
            )
            response = request.execute()
            items = response.get('items', [])
            logger.info(f"Fetched {len(items)} items from API for {channel.title}")
            
            new_video_ids = []
            for item in items:
                snippet = item['snippet']
                video_id = snippet['resourceId']['videoId']
                
                # Check existence
                stmt = select(Video).where(Video.id == video_id)
                res = await db.execute(stmt)
                if res.scalar_one_or_none():
                    continue

                new_video_ids.append(video_id)
                
                try:
                    pub_at = datetime.fromisoformat(snippet['publishedAt'].replace('Z', '+00:00'))
                except ValueError:
                    pub_at = datetime.utcnow()

                video = Video(
                    id=video_id,
                    channel_id=channel_id,
                    title=snippet['title'],
                    description=snippet['description'],
                    published_at=pub_at,
                    # Tags/Duration/Category filled in batch
                )
                db.add(video)
            
            await db.commit()

            if new_video_ids:
                await self.fetch_video_details_batch(db, new_video_ids)
            
            channel.last_fetched_at = datetime.utcnow()
            await db.commit()

        except HttpError as e:
            logger.error(f"YouTube API Error: {e}")
            if e.resp.status in [403, 400, 429]: # 400 often means Key Invalid too
                 logger.warning("Quota/Permission error. Switching to yt-dlp fallback.")
                 await self._sync_channel_ytdlp(db, channel_id, channel, limit)
        except Exception as e:
            logger.error(f"Sync error: {e}")

    async def _sync_channel_ytdlp(self, db: AsyncSession, channel_id: str, channel: Channel = None, limit: int = 20):
        """Fallback sync using yt-dlp"""
        try:
            logger.info(f"[Sync] Starting yt-dlp sync for channel: {channel_id}")
            
            # Fetch channel info if missing
            if not channel:
                info = await ytdlp_service.get_channel_info(channel_id)
                if not info:
                    logger.warning(f"Channel {channel_id} not found via yt-dlp.")
                    return
                
                channel = Channel(
                    id=channel_id,
                    title=info['title'],
                    thumbnail_url=info['thumbnail'],
                    uploads_playlist_id=f"UU{channel_id[2:]}", 
                    last_fetched_at=datetime.utcnow()
                )
                db.add(channel)
                await db.commit()
                await db.refresh(channel)

            # Fetch videos via yt-dlp
            videos = await ytdlp_service.get_channel_latest_videos(channel_id, limit=limit)
            logger.info(f"Fetched {len(videos)} videos via yt-dlp for {channel.title}")

            for v in videos:
                # Check if video exists
                existing = await db.execute(select(Video).where(Video.id == v['id']))
                existing_video = existing.scalars().first()
                
                # Parse published date. get_channel_latest_videos returns
                # 'YYYY-MM-DD' (via _format_date); older callers may send 'YYYYMMDD'.
                parsed_date = None
                p_date = v.get('published_at') or v.get('release_date')
                if p_date and isinstance(p_date, str):
                    s = p_date.strip()
                    try:
                        if len(s) == 8 and s.isdigit():
                            parsed_date = datetime.strptime(s, "%Y%m%d")
                        elif len(s) >= 10:
                            parsed_date = datetime.strptime(s[:10], "%Y-%m-%d")
                    except ValueError:
                        parsed_date = None

                if existing_video:
                    # Backfill the date only when we actually parsed a real one
                    if parsed_date:
                        existing_video.published_at = parsed_date
                        db.add(existing_video)
                    continue

                # New video: use the parsed date, else default to "now" so a
                # freshly synced upload isn't wrongly dropped by the 7-day
                # notifications window (previously defaulted to 1970 -> always filtered out).
                pub_at = parsed_date or datetime.utcnow()
                new_video = Video(
                    id=v['id'],
                    channel_id=channel_id,
                    title=v['title'],
                    description=f"Uploaded by {channel.title}",
                    tags=[],
                    category_id="",
                    published_at=pub_at,
                    duration=v.get('duration') or 0,
                    view_count=v.get('view_count') or 0
                )
                db.add(new_video)
            
            channel.last_fetched_at = datetime.utcnow()
            await db.commit()
            
        except Exception as e:
            logger.error(f"yt-dlp sync failed: {e}")

    async def fetch_video_details_batch(self, db: AsyncSession, video_ids: List[str]):
        """
        Enriches videos with tags, duration, category.
        """
        if not self.youtube:
            return

        chunk_size = 50
        for i in range(0, len(video_ids), chunk_size):
            chunk = video_ids[i:i + chunk_size]
            try:
                request = self.youtube.videos().list(
                    part="snippet,contentDetails,statistics",
                    id=",".join(chunk)
                )
                response = request.execute()
                
                for item in response.get('items', []):
                    vid = item['id']
                    snippet = item['snippet']
                    content_details = item['contentDetails']
                    stats = item['statistics']

                    stmt = update(Video).where(Video.id == vid).values(
                        tags=snippet.get('tags', []),
                        category_id=snippet.get('categoryId'),
                        duration=parse_duration(content_details.get('duration', 'PT0S')),
                        view_count=int(stats.get('viewCount', 0))
                    )
                    await db.execute(stmt)
                
                await db.commit()

            except Exception as e:
                logger.error(f"Batch Details Error: {e}")

sync_service = SyncService()
