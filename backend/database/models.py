from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .connection import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String, unique=True, index=True, nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False)
    password_version = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    playlists = relationship("Playlist", back_populates="owner")
    history = relationship("WatchHistory", back_populates="user")
    subscriptions = relationship("Subscription", back_populates="user")
    search_history = relationship("SearchHistory", back_populates="user")
    account_tokens = relationship("AccountToken", back_populates="user", cascade="all, delete-orphan")


class AccountToken(Base):
    __tablename__ = "account_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    purpose = Column(String(32), index=True, nullable=False)
    pending_value = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="account_tokens")

class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, index=True)  # Changed from 'title' to match DB schema
    description = Column(Text, nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    owner = relationship("User", back_populates="playlists")
    items = relationship("PlaylistItem", back_populates="playlist", cascade="all, delete-orphan")

class PlaylistItem(Base):
    __tablename__ = "playlist_items"

    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"))
    video_id = Column(String, index=True)
    video_title = Column(String)  # Changed from 'title' to match DB schema
    video_thumbnail = Column(String)  # Changed from 'thumbnail' to match DB schema
    video_author = Column(String, nullable=True)
    video_duration = Column(Integer)  # Changed from 'duration' to match DB schema
    order_index = Column(Integer)  # Changed from 'position' to match DB schema
    added_at = Column(DateTime, default=datetime.utcnow)
    
    playlist = relationship("Playlist", back_populates="items")

class WatchHistory(Base):
    __tablename__ = "watch_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    video_id = Column(String, index=True)
    video_title = Column(String)  # Changed from 'title' to match DB schema
    video_thumbnail = Column(String)  # Changed from 'thumbnail' to match DB schema
    video_author = Column(String, nullable=True)
    video_duration = Column(Integer, nullable=True)
    watched_at = Column(DateTime, default=datetime.utcnow)
    progress_seconds = Column(Integer, default=0)
    duration_watched = Column(Integer, default=0)
    completion_rate = Column(Float, default=0.0)
    interaction_type = Column(String, default='view')
    
    user = relationship("User", back_populates="history")

class SearchHistory(Base):
    __tablename__ = "search_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    query = Column(String)
    searched_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="search_history")

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    channel_id = Column(String, index=True)
    channel_name = Column(String)
    channel_thumbnail = Column(String, nullable=True)
    notify_enabled = Column(Boolean, default=False)
    subscribed_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="subscriptions")

class Channel(Base):
    __tablename__ = "channels"

    id = Column(String, primary_key=True, index=True)
    title = Column(String)
    thumbnail_url = Column(String)
    uploads_playlist_id = Column(String)
    last_fetched_at = Column(DateTime, nullable=True)

class Video(Base):
    __tablename__ = "videos"

    id = Column(String, primary_key=True, index=True)
    channel_id = Column(String, index=True) 
    title = Column(String)
    description = Column(Text)
    tags = Column(JSON)
    category_id = Column(String)
    published_at = Column(DateTime, index=True)
    duration = Column(Integer)
    view_count = Column(Integer)

class UserTagAffinity(Base):
    __tablename__ = "user_tag_affinity"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    tag = Column(String, primary_key=True)
    score = Column(Float)
    last_updated = Column(DateTime, default=datetime.utcnow)
