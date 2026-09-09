import re
from typing import Optional
from urllib.parse import parse_qs, urlsplit


def extract_youtube_video_id(value: str) -> Optional[str]:
    """Accept video IDs and supported YouTube URLs, never arbitrary hosts."""
    value = value.strip()
    valid_id = r"[A-Za-z0-9_-]{11}"
    if re.fullmatch(valid_id, value):
        return value
    try:
        url = urlsplit(f"https:{value}" if value.startswith("//") else
                       value if "://" in value else f"https://{value}")
        if url.scheme not in ("http", "https") or url.username or url.password:
            return None
        host = (url.hostname or "").lower()
        parts = [part for part in url.path.split("/") if part]
        video_id = None
        if host in ("youtu.be", "www.youtu.be") and len(parts) == 1:
            video_id = parts[0]
        elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
            if url.path == "/watch":
                video_id = parse_qs(url.query).get("v", [None])[0]
            elif len(parts) == 2 and parts[0] in ("shorts", "live", "embed", "v"):
                video_id = parts[1]
        elif host in ("youtube-nocookie.com", "www.youtube-nocookie.com"):
            if len(parts) == 2 and parts[0] == "embed":
                video_id = parts[1]
        return video_id if video_id and re.fullmatch(valid_id, video_id) else None
    except ValueError:
        return None
