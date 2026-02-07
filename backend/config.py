from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/youtube_alt"
    redis_url: str = "redis://localhost:6379"
    invidious_instances: str = "https://invidious.nerdvpn.de,https://invidious.jing.rocks,https://inv.tux.pizza"
    
    # Cache TTL in seconds
    video_cache_ttl: int = 3600  # 1 hour
    search_cache_ttl: int = 1800  # 30 minutes
    
    # YouTube Data API
    youtube_api_key: str = ""
    
    # yt-dlp Cookies (for 1080p/Premium)
    ytdlp_cookies_file: str = "cookies.txt"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
