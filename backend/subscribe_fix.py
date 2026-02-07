
import asyncio
from database.connection import AsyncSessionLocal
from database.models import Subscription

async def add_subscription():
    async with AsyncSessionLocal() as db:
        user_id = 3
        channel_id = "UCE9Dhdqe2M5cV4ZW-Ln3Stg" 
        
        print(f"Adding subscription for user {user_id} to {channel_id}")
        sub = Subscription(user_id=user_id, channel_id=channel_id)
        db.add(sub)
        try:
            await db.commit()
            print("Success!")
        except Exception as e:
            print(f"Error (probably already exists): {e}")

if __name__ == "__main__":
    asyncio.run(add_subscription())
