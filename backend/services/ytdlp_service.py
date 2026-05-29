import yt_dlp
import asyncio
from functools import partial
from typing import Optional, Dict, Any, List
import re
import os
import uuid
from config import get_settings
from services.cache_service import cache_service

class YtDlpService:
    """yt-dlp wrapper service for extracting video information and stream URLs"""
    
    def __init__(self):
        self.settings = get_settings()
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
        
        # Use cookies if available to unlock 1080p/Premium
        if self.settings.ytdlp_cookies_file and os.path.exists(self.settings.ytdlp_cookies_file):
            opts['cookiefile'] = self.settings.ytdlp_cookies_file
        
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
                streams = await self._extract_streams(info)
                
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
                    "upload_date": info.get("upload_date"),
                    "published_at": self._format_date(info.get("upload_date") or info.get("release_date")),
                    "tags": info.get("tags", []),
                    "categories": info.get("categories", []),
                    "subtitles": self._extract_subtitles(info),

                    "width": info.get("width") or max((s.get("width") or 0 for s in info.get("formats", []) if s.get("height")), default=0),
                    "height": info.get("height") or max((s.get("height") or 0 for s in info.get("formats", []) if s.get("height")), default=0),
                    "streams": streams,
                }
        except Exception as e:
            print(f"yt-dlp error: {e}")
            return None
    
    async def _extract_streams(self, info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract available streams from video info"""
        streams = []
        formats = info.get("formats", [])
        
        # Separate by type
        combined_formats = {}  # Video with audio
        audio_formats = []
        
        print(f"[DEBUG] Processing {len(formats)} formats for streams...")
        
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
                # STRICTLY enforce MP4 for direct proxy compatibility (Safari/iOS)
                if fmt.get("ext") != "mp4":
                    continue

                height = fmt.get("height", 0)
                quality = f"{height}p" if height else fmt.get("format_note", "unknown")
                
                # Keep best quality for each resolution
                if quality not in combined_formats or (fmt.get("tbr") or 0) > (combined_formats[quality].get("tbr") or 0):
                    combined_formats[quality] = {
                        "type": "combined",
                        "quality": quality,
                        "url": url,
                        "format": "mp4", # Confirmed MP4
                        "filesize": fmt.get("filesize"),
                        "tbr": fmt.get("tbr"),
                    }
            
            # Video-only stream (High Quality DASH) - Capture for Proxy Merging
            elif vcodec != "none" and acodec == "none":
                height = fmt.get("height", 0)
                # Only care about HD+ or if combined is missing
                if height >= 720:  # 720p, 1080p, 4K
                    quality = f"{height}p"
                    # Add as potential proxy target
                    # We store it in a separate list to process after finding best audio
                    if 'video_only' not in combined_formats: combined_formats['video_only'] = []
                    
                    # Check if this quality already exists in list
                    existing_idx = next((i for i, x in enumerate(combined_formats['video_only']) if x['quality'] == quality), -1)
                    
                    new_entry = {
                        "height": height,
                        "url": url,
                        "format": fmt.get("ext", "mp4"),
                        "quality": quality,
                        "fps": fmt.get("fps", 30),
                        "vcodec": vcodec
                    }

                    if existing_idx == -1:
                        combined_formats['video_only'].append(new_entry)
                    else:
                        # If existing is NOT avc1 but new one IS avc1, replace it (Prefer H.264)
                        existing = combined_formats['video_only'][existing_idx]
                        if not existing.get('vcodec', '').startswith('avc1') and vcodec.startswith('avc1'):
                            combined_formats['video_only'][existing_idx] = new_entry
                        # Or if same codec preference but higher bitrate/fps? (Optional)
        
        # Find best audio first
        best_audio_url = None
        if audio_formats:
            best_audio = max(audio_formats, key=lambda x: x.get("quality", 0))
            best_audio_url = best_audio["url"]
            streams.append(best_audio)
            print(f"[DEBUG] Found best audio: {best_audio.get('quality')} (URL len: {len(best_audio_url)})")
        else:
            print("[DEBUG] No AUDIO formats found!")

        # Process Video Only (Create Proxy Streams) - 1080p/720p Support
        video_only = combined_formats.pop('video_only', [])
        print(f"[DEBUG] Found {len(video_only)} video-only formats.")
        if best_audio_url:
            import urllib.parse
            for v in video_only:
                # Only add if we don't have a native combined format (or if native is bad)
                if v['quality'] in combined_formats:
                    print(f"[DEBUG] Skipping proxy for {v['quality']} (Native exists)")
                    continue
                
                # Generate Short ID for Proxy
                proxy_id = str(uuid.uuid4())
                
                # Store in Redis (TTL 1 hour)
                # We store as dict, cache_service handles json serialization
                await cache_service.set(f"proxy:{proxy_id}", {
                    "v": v['url'], 
                    "a": best_audio_url,
                    "vcodec": v.get('vcodec', '')
                }, ttl=3600)

                proxy_url = f"/api/video/merge?id={proxy_id}"
                
                print(f"[DEBUG] Generated proxy ID: {proxy_id} for quality {v['quality']}")
                streams.append({
                    "type": "combined",
                    "quality": v['quality'], # Show as normal quality (e.g. 1080p)
                    "url": proxy_url,
                    "format": "webm", # FFmpeg output
                    "filesize": 0,
                    "is_proxy": True,
                    "proxy_type": "merge"
                })

        # Add native combined formats (Proxified for stability & Range support)
        # Prioritize 360p for speed/default, then 720p for quality
        quality_order = ["360p", "720p", "480p", "1080p", "240p", "144p"]
        
        # Helper to proxify a format
        async def add_proxified_stream(q, fmt):
            proxy_id = str(uuid.uuid4())
            await cache_service.set(f"proxy:{proxy_id}", {
                "type": "direct",
                "url": fmt['url']
            }, ttl=3600)
            
            proxy_url = f"/api/video/merge?id={proxy_id}"
            print(f"[DEBUG] Generated DIRECT proxy ID: {proxy_id} for {q}")
            
            headers = fmt.copy()
            headers.update({
                "url": proxy_url,
                "is_proxy": True,
                "proxy_type": "direct",
                "_original_url": fmt['url'] # Keep original just in case
            })
            streams.append(headers)

        for q in quality_order:
            if q in combined_formats:
                await add_proxified_stream(q, combined_formats[q])
                del combined_formats[q]
        
        # Add remaining combined
        for q, fmt in combined_formats.items():
            await add_proxified_stream(q, fmt)
            
        # Add HLS Manifest (Enable 1080p+ Adaptive Streaming)
        # yt-dlp usually exposes this as 'manifest_url' (HLS) or 'manifest_url_hls'
        hls_url = info.get('manifest_url') or info.get('manifest_url_hls')
        
        # Fallback: Look for m3u8 in formats if top-level manifest is missing
        if not hls_url and formats:
            for fmt in formats:
                if fmt.get('protocol') == 'm3u8' or fmt.get('protocol') == 'm3u8_native' or fmt.get('ext') == 'm3u8':
                    hls_url = fmt.get('url')
                    if hls_url:
                        break
        
        if hls_url:
            streams.append({
                "type": "hls",
                "quality": "Auto (1080p+)",  # Label for UI
                "url": hls_url,
                "format": "m3u8",
                "filesize": 0
            })
        
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
    
    async def search(self, query: str, max_results: int = 20, offset: int = 0, sort: str = 'relevance') -> List[Dict[str, Any]]:
        """
        Search YouTube videos with parallel metadata fetching

        Args:
            query: Search query
            max_results: Number of results to return (limit)
            offset: Number of results to skip (0-based)
            sort: Result ordering — 'relevance' (default, keep YouTube's native
                  order), 'views' (view_count desc), or 'date' (newest first)
        """
        # Calculate playlist range (1-based)
        start = offset + 1
        end = offset + max_results
        
        # We need to ask for enough results in the search query
        # ytsearchN requests N results. To get item #40, we need ytsearch40.
        search_query = f"ytsearch{end}:{query}"
        
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True, # FAST mode
            'skip_download': True,
            'no_playlist': True,
            'playliststart': start,
            'playlistend': end,
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(opts) as ydl:
                # Use extract_info on the search query
                info = await loop.run_in_executor(
                    None,
                    partial(ydl.extract_info, search_query, download=False)
                )
                
                if not info or 'entries' not in info:
                    return []
                
                # entries might contain None for skipped items or errors
                entries = [e for e in info['entries'] if e]
                
                # For feed recommendations: return flat info without fetching details
                # This is MUCH faster (no extra API calls)
                results = []
                for entry in entries:
                    if entry and entry.get('id'):
                        results.append({
                            'id': entry.get('id'),
                            'title': entry.get('title'),
                            'thumbnail': entry.get('thumbnails', [{}])[0].get('url') if entry.get('thumbnails') else None,
                            'duration': entry.get('duration'),
                            'author': entry.get('uploader'),
                            'channel_id': entry.get('channel_id'),
                            'view_count': entry.get('view_count'),
                            'published_at': entry.get('upload_date'),
                        })
                
                # Ordering: yt-dlp already returns YouTube's relevance order.
                # Re-sorting by view_count (the old default) destroyed relevance,
                # so only re-sort when the caller explicitly asks.
                if sort == 'views':
                    results.sort(key=lambda x: x.get('view_count') or 0, reverse=True)
                elif sort == 'date':
                    results.sort(key=lambda x: x.get('published_at') or '', reverse=True)
                # sort == 'relevance' (default): keep native order

                return results
        except Exception as e:
            print(f"yt-dlp search error: {e}")
            return []

    def _extract_subtitles(self, info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract and format subtitles (both manual and auto)"""
        formatted_subs = []
        
        # Helper to process a sub dict
        def process_subs(subs_dict, is_auto):
            if not subs_dict:
                return
            
            for lang, formats in subs_dict.items():
                if not formats:
                    continue
                
                # Prefer vtt, then srt, then ttml
                # yt-dlp usually gives a list of formats. We want the URL.
                selected_fmt = None
                for ext in ['vtt', 'srt', 'ttml']:
                    for fmt in formats:
                        if fmt.get('ext') == ext:
                            selected_fmt = fmt
                            break
                    if selected_fmt:
                        break
                
                # If no preferred format found, take the first one
                if not selected_fmt and formats:
                    selected_fmt = formats[0]
                
                if selected_fmt:
                    formatted_subs.append({
                        "label": f"{lang} ({'Auto' if is_auto else 'Manual'})", # Simple label for now
                        "lang": lang,
                        "url": selected_fmt.get('url'),
                        "is_auto": is_auto,
                        "ext": selected_fmt.get('ext')
                    })

        # 1. Manual Subtitles (Priority)
        process_subs(info.get('subtitles'), False)
        
        # 2. Automatic Captions
        process_subs(info.get('automatic_captions'), True)
        
        return formatted_subs

    def _format_date(self, date_str: Optional[str]) -> Optional[str]:
        """Convert various date formats (YYYYMMDD, ISO) to YYYY-MM-DD"""
        if not date_str:
            return None
        
        # Handle YYYYMMDD (yt-dlp default upload_date)
        if len(date_str) == 8 and date_str.isdigit():
            return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
        
        # Handle ISO-like formats (e.g. 2026-02-21T00:00:00)
        if 'T' in date_str or '-' in date_str:
            return date_str[:10]
            
        return date_str

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



    async def get_channel_info(self, channel_id: str) -> Optional[Dict[str, Any]]:
        """Get channel metadata (title, thumbnail) without API"""
        url = f"https://www.youtube.com/channel/{channel_id}/about"
        
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'dump_single_json': True,
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
                    
                return {
                    "id": channel_id,
                    "title": info.get("uploader") or info.get("channel") or info.get("title"),
                    "thumbnail": info.get("thumbnail") or f"https://yt3.googleusercontent.com/ytc/{channel_id}", # Fallback/Dummy if failed
                }
        except Exception as e:
            print(f"yt-dlp channel info error: {e}")
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
            'extract_flat': False, # Get full info to ensure dates are present
            'skip_download': True,
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
                                "view_count": entry.get('view_count'),
                                "duration": entry.get('duration'),
                                "view_count": entry.get('view_count'),
                                "duration": entry.get('duration'),
                                "published_at": self._format_date(entry.get('upload_date') or entry.get('release_date'))
                            })
                return results
        except Exception as e:
            print(f"yt-dlp channel fetch error: {e}")
            return []


# Singleton instance
ytdlp_service = YtDlpService()
