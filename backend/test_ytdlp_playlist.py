import asyncio
import yt_dlp
import json
import urllib.parse
import sys

async def test_playlist():
    playlist_url = "https://www.youtube.com/watch?v=WWB01IuMvzA&list=PL-BRHyED9lufSicWcDIuXBZYynJyJNDkz&index=3"
    print(f"Testing playlist: {playlist_url}")
    
    opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'dump_single_json': True,
    }
    
    # Test 1: Original URL
    print("\n--- Test 1: Original URL ---")
    with yt_dlp.YoutubeDL(opts) as ydl:
        try:
            info = ydl.extract_info(playlist_url, download=False)
            print(f"Info keys: {list(info.keys())}")
            
            if 'entries' not in info:
                print("key 'entries' MISSING in info")
            
            entries = info.get('entries')
            if not entries:
                print("Entries is None or empty.")
            else:
                entries_list = list(entries)
                print(f"Entries count: {len(entries_list)}")
        except Exception as e:
            print(f"Error in Test 1: {e}")

    # Test 2: Cleaned URL
    print("\n--- Test 2: Cleaned URL ---")
    if "list=" in playlist_url:
        parsed = urllib.parse.urlparse(playlist_url)
        query = urllib.parse.parse_qs(parsed.query)
        list_id = query.get('list', [None])[0]
        
        if list_id:
            clean_url = f"https://www.youtube.com/playlist?list={list_id}"
            print(f"Testing CLEANED URL: {clean_url}")
            
            with yt_dlp.YoutubeDL(opts) as ydl:
                try:
                    info = ydl.extract_info(clean_url, download=False)
                    entries = info.get('entries')
                    if entries:
                        print(f"Clean URL Entries count: {len(list(entries))}")
                    else:
                        print("Clean URL also failed to get entries")
                except Exception as e:
                    print(f"Error in Test 2: {e}")
        else:
             print("Could not extract list ID")
    else:
        print("No list param in URL")

if __name__ == "__main__":
    asyncio.run(test_playlist())
