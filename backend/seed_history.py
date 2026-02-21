import asyncio
from database.connection import AsyncSessionLocal
from database.models import WatchHistory, Video
from sqlalchemy import select
from datetime import datetime
import json

dummy_history = [
    {
        "id": "dummy1",
        "title": "Go語言實戰：微服務架構設計與 gRPC 效能優化",
        "tags": ["Go語言", "微服務", "gRPC", "後端開發"],
        "desc": "深入淺出Go語言微服務架構實戰，涵蓋gRPC通訊與效能優化技巧"
    },
    {
        "id": "dummy2",
        "title": "Python AI 開發：YOLOv10 影像辨識與自動化系統教學",
        "tags": ["Python", "AI", "YOLOv10", "影像辨識", "機器學習"],
        "desc": "從零開始學習使用 YOLOv10 訓練專屬模型，並部署自動化辨識系統"
    },
    {
        "id": "dummy3",
        "title": "後端工程師必學：Nginx 反向代理與伺服器部署",
        "tags": ["Nginx", "反向代理", "伺服器", "DevOps"],
        "desc": "Nginx 設定全攻略，教你如何建置高可用的反向代理與負載均衡伺服器"
    },
    {
        "id": "dummy4",
        "title": "Synology NAS 網路設定、權限管理與 Docker 容器化應用",
        "tags": ["Synology", "NAS", "Docker", "網路設定", "儲存"],
        "desc": "精通 Synology NAS 的網路設定，並利用 Docker 輕鬆架設各類自託管服務"
    },
    {
        "id": "dummy5",
        "title": "動漫精華回顧：鬼滅之刃與火影忍者熱血片段剪輯",
        "tags": ["動漫", "鬼滅之刃", "火影忍者", "AMV", "熱血"],
        "desc": "回憶殺！精選鬼滅之刃與火影忍者最燃的戰鬥片段，配上熱血配樂的 AMV 剪輯"
    }
]

async def seed():
    async with AsyncSessionLocal() as session:
        user_id = 1
        
        # 1. Ensure these fake videos exist in the Video table so WatchHistory can join with them
        for item in dummy_history:
            stmt = select(Video).where(Video.id == item["id"])
            res = await session.execute(stmt)
            if not res.scalars().first():
                v = Video(
                    id=item["id"],
                    title=item["title"],
                    channel_id="dummy_channel",
                    description=item["desc"],
                    tags=item["tags"],
                    category_id="27",
                    duration=600,
                    published_at=datetime.utcnow()
                )
                session.add(v)
        
        # 2. Add to Watch History
        for i, item in enumerate(dummy_history):
            # Check if history exists
            stmt = select(WatchHistory).where(WatchHistory.user_id == user_id, WatchHistory.video_id == item["id"])
            res = await session.execute(stmt)
            if not res.scalars().first():
                wh = WatchHistory(
                    user_id=user_id,
                    video_id=item["id"],
                    video_title=item["title"],
                    video_thumbnail="",
                    video_author="Dummy Author",
                    video_duration=600,
                    watched_at=datetime.utcnow(),
                    progress_seconds=500,
                    duration_watched=500,
                    completion_rate=0.83, # Greater than 0.5 to count as positive
                    interaction_type="view"
                )
                session.add(wh)
                print(f"Added {item['title']} to WatchHistory")
            
        await session.commit()
        
        # Force a profile refresh to trigger the keyword generation immediately
        from services.recommendation_service import recommendation_service
        await recommendation_service.refresh_user_profile(session, user_id)
        
        print("Done seeding fake history and refreshing NLP profile!")

if __name__ == "__main__":
    asyncio.run(seed())
