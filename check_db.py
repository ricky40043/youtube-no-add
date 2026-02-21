import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from backend.database.models import Video, UserTagAffinity
from backend.database.connection import AsyncSessionLocal, engine

async def check():
    async with AsyncSessionLocal() as db:
        stmt = select(Video).where(Video.channel_id == 'recommendation')
        res = await db.execute(stmt)
        vids = res.scalars().all()
        print(f"Recommended videos in DB: {len(vids)}")
        for v in vids[:2]:
            print(v.title)
            
        stmt2 = select(UserTagAffinity)
        res2 = await db.execute(stmt2)
        tags = res2.scalars().all()
        print(f"User tags in DB: {len(tags)}")

asyncio.run(check())
