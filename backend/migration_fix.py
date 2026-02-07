
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from database.connection import DATABASE_URL, Base

async def migrate_db():
    print(f"Connecting to {DATABASE_URL}...")
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        print("Adding missing columns to watch_history...")
        try:
            await conn.execute(text("ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS duration_watched INTEGER DEFAULT 0"))
            await conn.execute(text("ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS completion_rate FLOAT DEFAULT 0.0"))
            await conn.execute(text("ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS interaction_type VARCHAR DEFAULT 'view'"))
            print("watch_history updated.")
        except Exception as e:
            print(f"Error updating watch_history: {e}")

        print("Creating new tables if not exist (UserTagAffinity, Channel, Video)...")
        # For new tables, we can rely on create_all, but sometimes it skips if it thinks metadata is somehow partially there? 
        # Actually create_all checks if table exists.
        
        # Checking Video table updates
        # Original Video table might presumably not exist in SQLAlchemy models before? 
        # Wait, previous `models.py` did NOT have a `Video` class?
        # Let's check `models.py` before my edits.
        # It seems `Video` class IS NEW. So `Base.metadata.create_all` SHOULD create it.
        # HOWEVER, `watch_history` existed, so `create_all` does nothing for it.
        
        # Let's run create_all explicitly again just in case
        await conn.run_sync(Base.metadata.create_all)
        print("Base.metadata.create_all executed.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate_db())
