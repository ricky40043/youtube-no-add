import asyncio
import json
from services.ytdlp_service import ytdlp_service

VIDEO_ID = "s4mg_0OY2bs" 

async def main():
    print(f"Fetching info for {VIDEO_ID}...")
    # Temporarily expose the raw info to see formats
    # But get_video_info processes it.
    # I'll modify ytdlp_service to print debug info inside it? 
    # Or just use the CLI?
    # CLI is better: `yt-dlp -j https://youtu.be/ID`
    import subprocess
    cmd = ["yt-dlp", "-J", f"https://www.youtube.com/watch?v={VIDEO_ID}"]
    
    print("Running yt-dlp CLI...")
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    
    if stdout:
        info = json.loads(stdout)
        formats = info.get('formats', [])
        print(f"Total formats found: {len(formats)}")
        for f in formats:
            if f.get('height') and f.get('height') > 360:
                print(f"Found High Quality: {f.get('format_id')} - {f.get('height')}p - {f.get('ext')} - Proto: {f.get('protocol')}")
            if 'm3u8' in str(f.get('url')) or f.get('ext') == 'm3u8':
                print(f"Found M3U8: {f.get('format_id')} - {f.get('url')[:50]}...")
    else:
        print(f"Error: {stderr.decode()}")

if __name__ == "__main__":
    asyncio.run(main())
