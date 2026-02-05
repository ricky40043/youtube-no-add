import asyncio
import os
import sys

# Ensure we can import from database
sys.path.append(os.getcwd())

from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from database.connection import AsyncSessionLocal
from database.models import Playlist, PlaylistItem

async def main():
    print("Connecting to DB...")
    async with AsyncSessionLocal() as session:
        print("Connected.")
        
        # 1. Fetch all playlists
        stmt = select(Playlist).options(selectinload(Playlist.items))
        result = await session.execute(stmt)
        playlists = result.scalars().all()
        
        print(f"Found {len(playlists)} playlists")
        for p in playlists:
            print(f"Playlist ID: {p.id}, Name: {p.name}")
            # Check if items are loaded
            try:
                count = len(p.items)
                print(f"  - Items count (from relationship): {count}")
            except Exception as e:
                print(f"  - Error accessing p.items: {e}")
            
            # Verify actual items in DB via direct query
            stmt_items = select(PlaylistItem).filter(PlaylistItem.playlist_id == p.id)
            result_items = await session.execute(stmt_items)
            items = result_items.scalars().all()
            print(f"  - Actual items count (direct query): {len(items)}")
            for item in items:
                 print(f"    - Item: {item.video_title} (ID: {item.video_id})")

if __name__ == "__main__":
    asyncio.run(main())
