import yt_dlp
import sys

URL = "https://www.youtube.com/watch?v=s4mg_0OY2bs"

def test_client(client):
    print(f"\nTesting client: {client}...")
    opts = {
        'quiet': True,
        'extract_flat': False,
        'no_warnings': True,
        'format': None, # Get all formats
        'extractor_args': {'youtube': {'player_client': [client]}},
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(URL, download=False)
            manifest = info.get('manifest_url') or info.get('manifest_url_hls')
            print(f"  Manifest Found: {manifest is not None}")
            if manifest:
                print(f"  Manifest URL: {manifest[:50]}...")
            
            formats = info.get('formats', [])
            m3u8_count = sum(1 for f in formats if 'm3u8' in str(f.get('protocol', '')) or f.get('ext') == 'm3u8')
            print(f"  M3U8 Formats: {m3u8_count}")
            dash_count = sum(1 for f in formats if 'dash' in str(f.get('protocol', '')))
            print(f"  DASH Formats: {dash_count}")
    except Exception as e:
        print(f"  Error: {e}")

if __name__ == "__main__":
    test_client('android')
    test_client('mweb')
    test_client('web')
