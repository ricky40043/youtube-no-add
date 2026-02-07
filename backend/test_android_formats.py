import yt_dlp
import sys
import json

URL = "https://www.youtube.com/watch?v=s4mg_0OY2bs"

def test_client():
    print(f"\nTesting client: android...")
    opts = {
        'quiet': True,
        'extract_flat': False,
        'no_warnings': True,
        'extractor_args': {'youtube': {'player_client': ['android']}},
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(URL, download=False)
            formats = info.get('formats', [])
            print(f"Total Formats: {len(formats)}")
            for f in formats:
                # Print format_id, extension, resolution, note
                note = f.get('format_note', '')
                res = f.get('resolution') or f"{f.get('width')}x{f.get('height')}"
                # Check if it has both video and audio
                vcodec = f.get('vcodec')
                acodec = f.get('acodec')
                is_combined = vcodec != 'none' and acodec != 'none'
                print(f"ID: {f['format_id']} | Ext: {f['ext']} | Res: {res} | Note: {note} | Combined: {is_combined}")
    except Exception as e:
        print(f"  Error: {e}")

if __name__ == "__main__":
    test_client()
