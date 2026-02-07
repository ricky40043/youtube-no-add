import asyncio
from database.connection import AsyncSessionLocal
from database.models import Video
from sqlalchemy import select, desc
from datetime import datetime

async def main():
    async with AsyncSessionLocal() as db:
        print("Checking recent videos...")
        stmt = select(Video.id, Video.published_at, Video.channel_id).order_by(Video.published_at.desc()).limit(10)
        res = await db.execute(stmt)
        rows = res.all()
        for r in rows:
            print(f"ID: {r[0]}, Date: {r[1]}, Channel: {r[2]}")
        
        if not rows:
            print("No videos found.")

if __name__ == "__main__":
    asyncio.run(main())
