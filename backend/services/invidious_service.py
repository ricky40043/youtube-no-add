import httpx
from typing import Optional, Dict, Any, List
import random
from config import get_settings


class InvidiousService:
    """Invidious API client as fallback for yt-dlp"""
    
    def __init__(self):
        settings = get_settings()
        self.instances = settings.invidious_instances.split(",")
        self._current_instance = None
    
    def _get_instance(self) -> str:
        """Get a random working instance"""
        if self._current_instance:
            return self._current_instance
        return random.choice(self.instances)
    
    async def get_video_info(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get video info from Invidious API"""
        instance = self._get_instance()
        url = f"{instance}/api/v1/videos/{video_id}"
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                
                # Find best streams
                streams = []
                
                # Add adaptive formats (separate video/audio)
                for fmt in data.get("adaptiveFormats", []):
                    if fmt.get("type", "").startswith("audio"):
                        streams.append({
                            "type": "audio",
                            "quality": fmt.get("bitrate", 0),
                            "url": fmt.get("url"),
                            "format": "m4a",
                        })
                    elif fmt.get("type", "").startswith("video"):
                        streams.append({
                            "type": "video",
                            "quality": fmt.get("qualityLabel", "unknown"),
                            "url": fmt.get("url"),
                            "format": "mp4",
                        })
                
                # Add legacy formats (video+audio combined)
                for fmt in data.get("formatStreams", []):
                    streams.append({
                        "type": "combined",
                        "quality": fmt.get("qualityLabel", "unknown"),
                        "url": fmt.get("url"),
                        "format": "mp4",
                    })
                
                return {
                    "id": data.get("videoId"),
                    "title": data.get("title"),
                    "author": data.get("author"),
                    "author_id": data.get("authorId"),
                    "thumbnail": data.get("videoThumbnails", [{}])[0].get("url"),
                    "description": data.get("description", "")[:500],
                    "duration": data.get("lengthSeconds"),
                    "view_count": data.get("viewCount"),
                    "upload_date": data.get("published"),
                    "streams": streams,
                }
        except Exception as e:
            print(f"Invidious error for {instance}: {e}")
            # Try another instance
            self._current_instance = None
            return None
    
    async def search(self, query: str, max_results: int = 20) -> List[Dict[str, Any]]:
        """Search videos using Invidious API"""
        instance = self._get_instance()
        url = f"{instance}/api/v1/search"
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params={
                    "q": query,
                    "type": "video",
                })
                response.raise_for_status()
                data = response.json()
                
                results = []
                for item in data[:max_results]:
                    if item.get("type") == "video":
                        results.append({
                            "id": item.get("videoId"),
                            "title": item.get("title"),
                            "author": item.get("author"),
                            "thumbnail": item.get("videoThumbnails", [{}])[0].get("url", 
                                f"https://i.ytimg.com/vi/{item.get('videoId')}/hqdefault.jpg"),
                            "duration": item.get("lengthSeconds"),
                            "view_count": item.get("viewCount"),
                            "published_at": item.get("published"),
                        })
                
                return results
        except Exception as e:
            print(f"Invidious search error: {e}")
            return []
    
    async def get_trending(self, region: str = "TW") -> List[Dict[str, Any]]:
        """Get trending videos"""
        instance = self._get_instance()
        url = f"{instance}/api/v1/trending"
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params={"region": region})
                response.raise_for_status()
                data = response.json()
                
                return [{
                    "id": item.get("videoId"),
                    "title": item.get("title"),
                    "author": item.get("author"),
                    "thumbnail": item.get("videoThumbnails", [{}])[0].get("url"),
                    "duration": item.get("lengthSeconds"),
                    "view_count": item.get("viewCount"),
                    "published_at": item.get("published"),
                } for item in data[:20]]
        except Exception as e:
            print(f"Invidious trending error: {e}")
            return []


# Singleton instance
invidious_service = InvidiousService()
