import logging
import math
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from database.models import Video, UserTagAffinity, WatchHistory, Channel
import jieba
import jieba.analyse
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

class RecommendationScorer:
    def __init__(self):
        # Default Weights
        self.ALPHA = 0.5  # Relevance
        self.BETA = 0.3   # Freshness
        self.GAMMA = 0.2  # Affinity
        
        # Decay half-life in hours
        self.HALF_LIFE_HOURS = 48 
        # Decay constant k = ln(2) / half_life
        self.DECAY_CONSTANT = math.log(2) / self.HALF_LIFE_HOURS

    def tokenize_text(self, text: str) -> str:
        """使用 jieba 進行中文斷詞，過濾掉單字元"""
        if not text:
            return ""
        words = jieba.cut(text)
        return " ".join([w for w in words if len(w) > 1])

    async def get_user_profile_text(self, db: AsyncSession, user_id: int) -> str:
        """將使用者最近的觀看紀錄組成一篇超級文本 (User Profile Text)"""
        stmt = select(WatchHistory)\
            .where(WatchHistory.user_id == user_id)\
            .order_by(WatchHistory.watched_at.desc())\
            .limit(50)
        
        result = await db.execute(stmt)
        history_items = result.scalars().all()
        
        texts = []
        for wh in history_items:
            t = wh.video_title or ""
            # 跟據觀看完成度決定權重 (字串重複次數)
            weight = max(1, int((wh.completion_rate or 0) * 3))
            texts.extend([t] * weight)
            
        return " ".join([self.tokenize_text(t) for t in texts])

    async def calculate_scores_batch(self, user_profile_text: str, videos: List[Video], sub_channel_ids: set) -> List[tuple[float, Video]]:
        """
        批次計算所有候選影片的推薦分數
        Score = alpha * relevance (TF-IDF Cosine Similarity) + beta * freshness + gamma * affinity
        """
        if not videos:
            return []
            
        # 1. 準備 Corpus (語料庫)
        # 第一筆資料為 User Profile
        corpus = [user_profile_text if user_profile_text else ""]
        
        # 準備每部影片的文本 (標題加權 + 描述)
        for v in videos:
            t = v.title or ""
            desc = (v.description or "")[:200]
            tags = " ".join(v.tags) if v.tags else ""
            vid_text = f"{t} {t} {desc} {tags}" # 標題給予雙倍權重
            corpus.append(self.tokenize_text(vid_text))
            
        # 2. 轉換 TF-IDF 矩陣並計算相似度
        similarities = [0.0] * len(videos)
        if user_profile_text.strip():
            try:
                vectorizer = TfidfVectorizer()
                tfidf_matrix = vectorizer.fit_transform(corpus)
                user_vector = tfidf_matrix[0:1]
                candidate_vectors = tfidf_matrix[1:]
                # 取得 candidate 陣列的相似度
                similarities = cosine_similarity(user_vector, candidate_vectors)[0]
            except Exception as e:
                logger.error(f"TF-IDF Error: {e}")
                
        # 3. 綜合評分
        scored_videos = []
        now = datetime.utcnow()
        for i, video in enumerate(videos):
            sim = similarities[i]
            
            # Freshness (Exponential Decay)
            freshness_score = 0.0
            if video.published_at:
                pub = video.published_at
                if pub.tzinfo is not None:
                    pub = pub.replace(tzinfo=None)
                age_hours = (now - pub).total_seconds() / 3600
                if age_hours < 0: age_hours = 0
                freshness_score = math.exp(-self.DECAY_CONSTANT * age_hours)
                
            # Affinity (訂閱頻道加分)
            affinity_score = 1.0 if video.channel_id in sub_channel_ids else 0.0
            
            final_score = (self.ALPHA * sim) + (self.BETA * freshness_score) + (self.GAMMA * affinity_score)
            scored_videos.append((final_score, video))
            
        return scored_videos

    async def refresh_user_profile(self, db: AsyncSession, user_id: int):
        """
        更新使用者的 Top Keywords 到 UserTagAffinity 中，供背景搜尋器使用。
        """
        user_text = await self.get_user_profile_text(db, user_id)
        if not user_text.strip():
            return
            
        # 使用 jieba.analyse 提取 TF-IDF 權重最高的前 10 個關鍵字
        keywords = jieba.analyse.extract_tags(user_text, topK=10, withWeight=True)
        
        try:
            await db.execute(delete(UserTagAffinity).where(UserTagAffinity.user_id == user_id))
            
            for tag, score in keywords:
                uta = UserTagAffinity(user_id=user_id, tag=tag, score=float(score))
                db.add(uta)
            
            await db.commit()
            logger.info(f"Refreshed NLP keywords for user {user_id}. Top keyword: {keywords[0][0] if keywords else 'None'}")
        except Exception as e:
            logger.error(f"Failed to refresh NLP profile: {e}")
            await db.rollback()

    async def fetch_recommendations_for_user(self, db: AsyncSession, user_id: int):
        """
        Background task to fetch related videos from YouTube using the user's top tags
        and store them in the Video table so they can be surfaced in the feed.
        """
        try:
            # 1. Get Top 2-3 tags
            stmt = select(UserTagAffinity).where(UserTagAffinity.user_id == user_id).order_by(UserTagAffinity.score.desc()).limit(3)
            result = await db.execute(stmt)
            top_tags = result.scalars().all()
            
            if not top_tags:
                return

            from services.ytdlp_service import ytdlp_service
            
            # 2. Search YouTube for each tag
            for uta in top_tags:
                tag = uta.tag
                logger.info(f"Fetching recommendations for tag: {tag}")
                try:
                    # search using yt-dlp
                    results = await ytdlp_service.search(tag, max_results=5)
                    for r in results:
                        vid_id = r.get("id")
                        if not vid_id:
                            continue
                            
                        # Check if video exists
                        exist_stmt = select(Video).where(Video.id == vid_id)
                        exist_res = await db.execute(exist_stmt)
                        if exist_res.scalars().first():
                            continue # Skip if already in DB
                            
                        # Parse date carefully
                        pub_at = r.get("published_at")
                        dt = datetime.utcnow()
                        if pub_at and isinstance(pub_at, str) and len(pub_at) == 8:
                            try:
                                dt = datetime.strptime(pub_at, "%Y%m%d")
                            except:
                                pass

                        v = Video(
                            id=vid_id,
                            channel_id=r.get("channel_id", "recommendation"),
                            title=r.get("title", ""),
                            description=f"Author: {r.get('author', 'Unknown')} (Recommended via tag: {tag})",
                            tags=[tag],
                            category_id="",
                            published_at=dt,
                            duration=r.get("duration") or 0,
                            view_count=r.get("view_count") or 0
                        )
                        db.add(v)
                    await db.commit()
                except Exception as e:
                    logger.error(f"Failed fetching recommendations for tag '{tag}': {e}")
                    await db.rollback()
        except Exception as e:
            logger.error(f"Error in fetch_recommendations_for_user: {e}")
            await db.rollback()

recommendation_service = RecommendationScorer()
