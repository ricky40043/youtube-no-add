import asyncio
from sqlalchemy import select
from backend.database.connection import AsyncSessionLocal
from backend.database.models import Video

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(Video).limit(500)
        res = await db.execute(stmt)
        for v in res.scalars().all():
            if v.id and "8vul" in v.id:
                print(f"ID is 8vul: {v.id}")
            if v.published_at and "8vul" in str(v.published_at):
                print(f"Published At is 8vul: {v.published_at}")
            if v.view_count and "8vul" in str(v.view_count):
                print(f"View count is 8vul: {v.view_count}")
            if v.author and "8vul" in v.author:
                print(f"Author is 8vul: {v.author}")
                
asyncio.run(main())
