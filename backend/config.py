from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/youtube_alt"
    redis_url: str = "redis://localhost:6379"
    invidious_instances: str = "https://inv.nadeko.net,https://invidious.nerdvpn.de,https://invidious.jing.rocks"
    
    # Cache TTL in seconds
    video_cache_ttl: int = 3600  # 1 hour
    search_cache_ttl: int = 1800  # 30 minutes
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
