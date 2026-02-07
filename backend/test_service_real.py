import asyncio
import sys
# Add current dir to path to find backend modules
sys.path.append('.')
from services.ytdlp_service import YtDlpService

VIDEO_ID = "s4mg_0OY2bs"

async def main():
    service = YtDlpService()
    print(f"Fetching info for {VIDEO_ID}...")
    info = await service.get_video_info(VIDEO_ID)
    
    if not info:
        print("Failed to get info.")
        return

    print(f"\nTitle: {info.get('title')}")
    streams = info.get('streams', [])
    print(f"Total Streams: {len(streams)}")
    
    for s in streams:
        print(f" - {s.get('quality')} | {s.get('type')} | Proxy: {s.get('is_proxy', False)}")

if __name__ == "__main__":
    asyncio.run(main())
