import redis.asyncio as redis
import json
from typing import Optional, Any
from config import get_settings


class CacheService:
    """Redis cache service for video metadata"""
    
    def __init__(self):
        self._redis: Optional[redis.Redis] = None
    
    async def get_redis(self) -> redis.Redis:
        """Get or create Redis connection"""
        if self._redis is None:
            settings = get_settings()
            self._redis = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
        return self._redis
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            r = await self.get_redis()
            value = await r.get(key)
            return json.loads(value) if value else None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    
    async def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        """Set value in cache with TTL"""
        try:
            r = await self.get_redis()
            await r.set(key, json.dumps(value), ex=ttl)
            return True
        except Exception as e:
            print(f"Cache set error: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            r = await self.get_redis()
            await r.delete(key)
            return True
        except Exception as e:
            print(f"Cache delete error: {e}")
            return False
    
    def video_key(self, video_id: str) -> str:
        """Generate cache key for video info"""
        return f"video:{video_id}"
    
    def search_key(self, query: str) -> str:
        """Generate cache key for search results"""
        return f"search:{query.lower().strip()}"


# Singleton instance
cache_service = CacheService()
