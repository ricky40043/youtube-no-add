import logging
import math
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from database.models import Video, UserTagAffinity, WatchHistory, Channel

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

    async def calculate_score(self, video: Video, user_profile: Dict[str, float], channel_affinity: float = 0.0) -> float:
        """
        Calculates the recommendation score for a single video.
        Score = alpha * relevance + beta * freshness + gamma * affinity
        """
        
        # 1. Relevance (Jaccard-like weighted overlap)
        relevance_score = 0.0
        if video.tags and user_profile:
            # Video tags list: ["AI", "Python"]
            # Profile: {"AI": 0.8, "Java": 0.2}
            
            # Simple intersection sum
            overlap_score = sum(user_profile.get(tag, 0.0) for tag in video.tags)
            
            # Normalize? If video has many tags, score increases?
            # Jaccard: intersection / union
            # Weighted Jaccard: sum(min(u_i, v_i)) / sum(max(u_i, v_i))
            # Binary Jaccard on tags: intersection / union
            
            # Implementation from spec: "sum of weights of interested tags / total video tags"
            # This is "Precision" rather than Jaccard, but works well to penalize spammy tags
            if video.tags:
                 max_possible = len(video.tags)
                 relevance_score = overlap_score / max_possible if max_possible > 0 else 0
        
        # 2. Freshness (Exponential Decay)
        freshness_score = 0.0
        if video.published_at:
            # Handle potential timezone naive/aware issues by converting to simple age in hours
             # Check if naive
            pub = video.published_at
            if pub.tzinfo is None:
                # Assume UTC if naive, as stored by us
                now = datetime.utcnow()
            else:
                now = datetime.now(pub.tzinfo)
            
            age_hours = (now - pub).total_seconds() / 3600
            if age_hours < 0: age_hours = 0 # Future video?
            
            # exp(-k * t)
            freshness_score = math.exp(-self.DECAY_CONSTANT * age_hours)
            
        # 3. Affinity (Channel Affinity)
        # Passed in as argument to avoid DB lookup per video here
        affinity_score = channel_affinity

        final_score = (self.ALPHA * relevance_score) + (self.BETA * freshness_score) + (self.GAMMA * affinity_score)
        return final_score

    async def refresh_user_profile(self, db: AsyncSession, user_id: int):
        """
        Re-calculates UserTagAffinity based on recent WatchHistory.
        Should be called periodically (e.g. daily or after session).
        """
        # 1. Fetch positive interactions (completion > 0.5 or liked)
        # Limit to last 100 watched videos for efficiency?
        stmt = select(WatchHistory, Video).join(Video, WatchHistory.video_id == Video.id)\
            .where(WatchHistory.user_id == user_id)\
            .where(WatchHistory.completion_rate > 0.5)\
            .order_by(WatchHistory.watched_at.desc())\
            .limit(100)
        
        result = await db.execute(stmt)
        history_items = result.all() # [(WatchHistory, Video), ...]
        
        tag_scores = {}
        tag_counts = {}
        
        for wh, video in history_items:
            if not video.tags: continue
            
            weight = wh.completion_rate
            # Time decay for history itself? (Recent watches matter more)
            # Simple approach first.
            
            for tag in video.tags:
                tag_scores[tag] = tag_scores.get(tag, 0.0) + weight
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        
        # Normalize?
        # We store raw scores or normalized?
        # Let's keep top 100 tags
        sorted_tags = sorted(tag_scores.items(), key=lambda x: x[1], reverse=True)[:100]
        
        # Rewrite UserTagAffinity
        # Transactional delete and insert
        try:
            await db.execute(delete(UserTagAffinity).where(UserTagAffinity.user_id == user_id))
            
            for tag, score in sorted_tags:
                # Max score normalization to 0-1 range roughly if needed, 
                # but Jaccard handles relative values.
                # Let's just store the raw accumulated weight for now.
                uta = UserTagAffinity(user_id=user_id, tag=tag, score=score)
                db.add(uta)
            
            await db.commit()
            logger.info(f"Refreshed profile for user {user_id}. Top tag: {sorted_tags[0] if sorted_tags else 'None'}")
        except Exception as e:
            logger.error(f"Failed to refresh profile: {e}")
            await db.rollback()

recommendation_service = RecommendationScorer()
