import asyncio
from sqlalchemy import select, func, desc
from database.connection import AsyncSessionLocal
from database.models import Video, Subscription
from datetime import datetime, timedelta

async def main():
    async with AsyncSessionLocal() as db:
        # 1. Count Total Videos
        result = await db.execute(select(func.count(Video.id)))
        total_videos = result.scalar()
        print(f"Total Videos in DB: {total_videos}")

        # 2. Count Subscriptions
        result = await db.execute(select(func.count(Subscription.id)))
        total_subs = result.scalar()
        print(f"Total Subscriptions: {total_subs}")

        # 3. Check 180-day window
        cutoff = datetime.utcnow() - timedelta(days=180)
        stmt = select(func.count(Video.id)).where(Video.published_at >= cutoff)
        result = await db.execute(stmt)
        recent_videos = result.scalar()
        print(f"Videos within last 180 days: {recent_videos}")

        # 4. List latest 10 videos with dates
        stmt = select(Video.id, Video.title, Video.published_at).order_by(desc(Video.published_at)).limit(10)
        result = await db.execute(stmt)
        print("\nLatest 10 Videos:")
        for v in result.all():
            print(f"[{v.published_at}] {v.title} ({v.id})")

if __name__ == "__main__":
    asyncio.run(main())
