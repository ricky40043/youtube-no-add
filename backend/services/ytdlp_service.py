import yt_dlp
import asyncio
from functools import partial
from typing import Optional, Dict, Any, List
import re


class YtDlpService:
    """yt-dlp wrapper service for extracting video information and stream URLs"""
    
    def __init__(self):
        self.ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            # Get best video+audio format, or separate streams
            'format': 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
            'no_playlist': True,
        }
    
    @staticmethod
    def extract_video_id(url_or_id: str) -> str:
        """Extract video ID from URL or return as-is if already an ID"""
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})',
            r'^([a-zA-Z0-9_-]{11})$'
        ]
        for pattern in patterns:
            match = re.search(pattern, url_or_id)
            if match:
                return match.group(1)
        return url_or_id
    
    async def get_video_info(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get video metadata"""
        video_id = self.extract_video_id(video_id)
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Request ALL formats to get both video and audio streams
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'no_playlist': True,
            # Don't filter formats - get everything
            'format': None,
            'listformats': False,
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await loop.run_in_executor(
                    None, 
                    partial(ydl.extract_info, url, download=False)
                )
                
                if not info:
                    return None
                
                # Extract streams
                streams = self._extract_streams(info)
                
                return {
                    "id": info.get("id"),
                    "title": info.get("title"),
                    "author": info.get("uploader") or info.get("channel"),
                    "author_id": info.get("channel_id"),
                    "channel_id": info.get("channel_id"),
                    "thumbnail": info.get("thumbnail"),
                    "description": info.get("description", "")[:500],
                    "duration": info.get("duration"),
                    "view_count": info.get("view_count"),
                    "upload_date": info.get("upload_date"),

                    "width": info.get("width") or max((s.get("width") or 0 for s in info.get("formats", []) if s.get("height")), default=0),
                    "height": info.get("height") or max((s.get("height") or 0 for s in info.get("formats", []) if s.get("height")), default=0),
                    "streams": streams,
                }
        except Exception as e:
            print(f"yt-dlp error: {e}")
            return None
    
    def _extract_streams(self, info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract available streams from video info"""
        streams = []
        formats = info.get("formats", [])
        
        # Separate by type
        combined_formats = {}  # Video with audio
        audio_formats = []
        
        for fmt in formats:
            # Skip storyboards and similar
            if fmt.get("format_note") == "storyboard":
                continue
            
            url = fmt.get("url")
            if not url:
                continue
            
            vcodec = fmt.get("vcodec", "none")
            acodec = fmt.get("acodec", "none")
            
            # Audio-only stream
            if vcodec == "none" and acodec != "none":
                audio_formats.append({
                    "type": "audio",
                    "quality": fmt.get("abr", 0),
                    "url": url,
                    "format": fmt.get("ext", "m4a"),
                    "filesize": fmt.get("filesize"),
                })
            # Combined video+audio stream (most mobile-friendly)
            elif vcodec != "none" and acodec != "none":
                height = fmt.get("height", 0)
                quality = f"{height}p" if height else fmt.get("format_note", "unknown")
                
                # Keep best quality for each resolution
                if quality not in combined_formats or (fmt.get("tbr") or 0) > (combined_formats[quality].get("tbr") or 0):
                    combined_formats[quality] = {
                        "type": "combined",
                        "quality": quality,
                        "url": url,
                        "format": fmt.get("ext", "mp4"),
                        "filesize": fmt.get("filesize"),
                        "tbr": fmt.get("tbr"),
                    }
        
        # Add combined formats sorted by quality (prefer these for mobile playback)
        quality_order = ["1080p", "720p", "480p", "360p", "296p", "240p", "144p"]
        for q in quality_order:
            if q in combined_formats:
                streams.append(combined_formats[q])
        
        # Also add any remaining combined formats not in the standard list
        for q, fmt in combined_formats.items():
            if q not in quality_order:
                streams.append(fmt)
        
        # Add best audio format for background playback
        if audio_formats:
            best_audio = max(audio_formats, key=lambda x: x.get("quality", 0))
            streams.append(best_audio)
        
        return streams
    
    async def get_audio_stream_url(self, video_id: str) -> Optional[str]:
        """Get best audio stream URL for background playback"""
        video_id = self.extract_video_id(video_id)
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'no_playlist': True,
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await loop.run_in_executor(
                    None,
                    partial(ydl.extract_info, url, download=False)
                )
                return info.get("url") if info else None
        except Exception as e:
            print(f"yt-dlp audio stream error: {e}")
            return None
    
    async def search(self, query: str, max_results: int = 20) -> List[Dict[str, Any]]:
        """Search YouTube videos"""
        search_url = f"ytsearch{max_results}:{query}"
        
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'no_playlist': True,
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await loop.run_in_executor(
                    None,
                    partial(ydl.extract_info, search_url, download=False)
                )
                
                if not info or 'entries' not in info:
                    return []
                
                results = []
                for entry in info['entries']:
                    if entry:
                        results.append({
                            "id": entry.get("id"),
                            "title": entry.get("title"),
                            "author": entry.get("uploader") or entry.get("channel"),
                            "thumbnail": entry.get("thumbnail") or f"https://i.ytimg.com/vi/{entry.get('id')}/hqdefault.jpg",
                            "duration": entry.get("duration"),
                            "view_count": entry.get("view_count"),
                        })
                
                return results
        except Exception as e:
            print(f"yt-dlp search error: {e}")
            return []

    async def get_playlist_info(self, playlist_url: str) -> Optional[Dict[str, Any]]:
        """Get playlist metadata and items"""
        # Ensure it's a playlist URL
        if "list=" not in playlist_url:
            return None
            
        # Clean URL: If it's a watch URL with list param, convert to pure playlist URL
        # This ensures yt-dlp extracts the playlist items, not just the single video context
        if "v=" in playlist_url:
            try:
                import urllib.parse
                parsed = urllib.parse.urlparse(playlist_url)
                query = urllib.parse.parse_qs(parsed.query)
                list_id = query.get('list', [None])[0]
                if list_id:
                    playlist_url = f"https://www.youtube.com/playlist?list={list_id}"
            except Exception:
                pass # Fallback to original URL if parsing fails

        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True, # Don't extract individual video details, just list
            'dump_single_json': True,
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await loop.run_in_executor(
                    None,
                    partial(ydl.extract_info, playlist_url, download=False)
                )
                
                if not info:
                    return None
                    
                items = []
                for entry in info.get('entries', []):
                    if entry:
                         # Handle possibly missing keys safely
                        vid_id = entry.get('id')
                        # Fallback: extract from URL if ID is missing
                        if not vid_id and entry.get('url'):
                            vid_id = self.extract_video_id(entry.get('url'))
                            
                        if vid_id:
                             # Get thumbnail from 'thumbnail' key or first item in 'thumbnails' list
                             thumb = entry.get('thumbnail')
                             if not thumb and entry.get('thumbnails'):
                                 thumb = entry.get('thumbnails')[0].get('url')
                             
                             items.append({
                                "video_id": vid_id,
                                "title": entry.get('title', 'Unknown Title'),
                                "thumbnail": thumb or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                                "duration": entry.get('duration', 0)
                             })
                
                return {
                    "title": info.get('title', 'Imported Playlist'),
                    "id": info.get('id'),
                    "item_count": len(items),
                    "items": items
                }
        except Exception as e:
            print(f"yt-dlp playlist extraction error: {e}")
            return None


    async def get_channel_latest_videos(self, channel_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Get latest videos from a channel"""
        # Construction channel URL (videos tab)
        # Handle if channel_id is actually a handle (@...) or ID
        if channel_id.startswith('@'):
            url = f"https://www.youtube.com/{channel_id}/videos"
        else:
            url = f"https://www.youtube.com/channel/{channel_id}/videos"
            
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',
            'playlistend': limit, # Limit number of items
            'no_playlist': False 
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await loop.run_in_executor(
                    None,
                    partial(ydl.extract_info, url, download=False)
                )
                
                if not info or 'entries' not in info:
                    return []
                
                results = []
                for entry in info['entries']:
                    if entry:
                        # Map to common format
                        vid_id = entry.get('id')
                        if vid_id:
                            results.append({
                                "id": vid_id,
                                "title": entry.get('title'),
                                "thumbnail": entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                                "author": entry.get('uploader') or info.get('uploader') or info.get('title'),
                                "channel_id": channel_id,
                                "view_count": entry.get('view_count'),
                                "duration": entry.get('duration'),
                                "published_at": entry.get('upload_date')
                            })
                return results
        except Exception as e:
            print(f"yt-dlp channel fetch error: {e}")
            return []


# Singleton instance
ytdlp_service = YtDlpService()
