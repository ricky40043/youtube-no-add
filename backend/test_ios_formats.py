import asyncio
import subprocess

VIDEO_ID = "s4mg_0OY2bs"

async def main():
    print("Listing formats with iOS client...")
    cmd = [
        "yt-dlp", 
        "--extractor-args", "youtube:player_client=ios", 
        "-F", 
        f"https://www.youtube.com/watch?v={VIDEO_ID}"
    ]
    
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    
    if stdout:
        print(stdout.decode())
    if stderr:
        print("STDERR:", stderr.decode())

if __name__ == "__main__":
    asyncio.run(main())
