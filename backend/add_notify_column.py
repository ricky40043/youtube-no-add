
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Use the same default as in connection.py
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@postgres/dbname")

# If running locally and targeting localhost, we might need to adjust. 
# But usually the user's environment has the URL set.
# If it fails, I might need to ask or try localhost.

async def migrate():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        try:
            print("Attempting to add notify_enabled column...")
            await conn.execute(text("ALTER TABLE subscriptions ADD COLUMN notify_enabled BOOLEAN DEFAULT FALSE"))
            print("Column added successfully.")
        except Exception as e:
            print(f"Migration failed (columns might already exist): {e}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
