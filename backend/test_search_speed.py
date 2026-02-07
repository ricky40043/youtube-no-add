import yt_dlp
import json
import time

def test_search(flat=False):
    opts = {
        'quiet': True,
        'extract_flat': flat,
        'skip_download': True,
        'no_playlist': True,
    }
    
    query = "木棉花"
    url = f"ytsearch5:{query}" # limit to 5 for test
    
    start = time.time()
    print(f"Testing with extract_flat={flat}...")
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
    duration = time.time() - start
    print(f"Done in {duration:.2f}s")
    
    if 'entries' in info:
        entries = list(info['entries'])
        print(f"Found {len(entries)} entries")
        if entries:
            print("First entry sample keys:", entries[0].keys())
            print("First entry upload_date:", entries[0].get('upload_date'))
            print("First entry title:", entries[0].get('title'))

print("--- FLAT=True ---")
test_search(True)

print("\n--- FLAT=False ---")
test_search(False)
