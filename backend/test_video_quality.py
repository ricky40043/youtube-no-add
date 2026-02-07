import asyncio
import json
from services.ytdlp_service import ytdlp_service

# Test ID from previous DB check (Muse Wood)
# VIDEO_ID = "s4mg_0OY2bs" 
# Or use a popular one confirmed to have 1080p
VIDEO_ID = "jNQXAC9IVRw" # First video ever, might be low quality? No.
VIDEO_ID = "jfKfPfyJRdk" # Lofi girl live? No.
VIDEO_ID = "s4mg_0OY2bs" # Muse valid video

async def main():
    print(f"Fetching info for {VIDEO_ID}...")
    info = await ytdlp_service.get_video_info(VIDEO_ID)
    
    if not info:
        print("Failed to get info.")
        return

    print(f"Title: {info.get('title')}")
    print(f"Manifest URL: {info.get('manifest_url')}")
    
    print("\n--- Extracted Streams ---")
    for s in info.get('streams', []):
        print(f"Type: {s.get('type')}, Quality: {s.get('quality')}, Format: {s.get('format')}")

    # Check raw formats for m3u8 if missing
    # print("\n--- Raw Formats (First 5) ---")
    # formats = info.get('formats', [])
    # for f in formats[:5]:
    #    print(f"Ext: {f.get('ext')}, Proto: {f.get('protocol')}, Url: {f.get('url')[:30]}...")

if __name__ == "__main__":
    asyncio.run(main())
