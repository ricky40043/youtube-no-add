import yt_dlp
import json

def check_subs():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    opts = {
        'quiet': True,
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'no_playlist': True,
    }
    
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        print("\n--- Subtitles ---")
        subs = info.get('subtitles', {})
        print(f"Count: {len(subs)}")
        for lang, formats in subs.items():
            print(f"Lang: {lang}")
            for f in formats:
                print(f"  - {f.get('ext')}: {f.get('url')[:50]}...")
                
        print("\n--- Automatic Captions ---")
        auto_subs = info.get('automatic_captions', {})
        print(f"Count: {len(auto_subs)}")
        # Print first few to see structure
        keys = list(auto_subs.keys())
        for lang in keys[:5]:
            formats = auto_subs[lang]
            print(f"Lang: {lang}")
            for f in formats:
                 print(f"  - {f.get('ext')}: {f.get('url')[:50]}...")
                 
        if 'zh-Hant' in auto_subs:
            print("\nFound zh-Hant in auto_subs!")

check_subs()
