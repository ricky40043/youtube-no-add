from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from database.connection import get_db
from database.models import User, Playlist, PlaylistItem
from services.ytdlp_service import ytdlp_service
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter(
    tags=["playlists"]
)

# Pydantic Models
class PlaylistItemBase(BaseModel):
    video_id: str
    title: str
    thumbnail: str
    duration: int
    position: Optional[int] = 0

class PlaylistBase(BaseModel):
    title: str
    description: Optional[str] = None

class PlaylistCreate(PlaylistBase):
    user_id: int # Auth will inject this properly later

class ImportPlaylistRequest(BaseModel):
    url: str
    user_id: int # Mock auth for now

class PlaylistResponse(PlaylistBase):
    id: int
    user_id: int
    created_at: datetime
    # items: List[PlaylistItemBase] = [] # Use separate endpoint or optional include

    class Config:
        orm_mode = True

class PlaylistItemResponse(PlaylistItemBase):
    id: int
    added_at: datetime
    
    class Config:
        orm_mode = True

# CRUD Endpoints

@router.get("/", response_model=List[PlaylistResponse])
async def get_playlists(user_id: int, db: AsyncSession = Depends(get_db)):
    # TODO: Get user_id from auth token dependency
    result = await db.execute(select(Playlist).filter(Playlist.user_id == user_id))
    return result.scalars().all()

@router.post("/", response_model=PlaylistResponse)
async def create_playlist(playlist: PlaylistCreate, db: AsyncSession = Depends(get_db)):
    # Verify user exists (optional if FK valid)
    new_playlist = Playlist(
        title=playlist.title,
        description=playlist.description,
        user_id=playlist.user_id
    )
    db.add(new_playlist)
    await db.commit()
    await db.refresh(new_playlist)
    return new_playlist

@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    playlist = result.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist

@router.get("/{playlist_id}/items", response_model=List[PlaylistItemResponse])
async def get_playlist_items(playlist_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaylistItem)
        .filter(PlaylistItem.playlist_id == playlist_id)
        .order_by(PlaylistItem.position)
    )
    return result.scalars().all()

@router.post("/{playlist_id}/items", response_model=PlaylistItemResponse)
async def add_item_to_playlist(playlist_id: int, item: PlaylistItemBase, db: AsyncSession = Depends(get_db)):
    # Check if playlist exists
    playlist_result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    if not playlist_result.scalars().first():
        raise HTTPException(status_code=404, detail="Playlist not found")

    new_item = PlaylistItem(
        playlist_id=playlist_id,
        video_id=item.video_id,
        title=item.title,
        thumbnail=item.thumbnail,
        duration=item.duration,
        position=item.position
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return new_item

@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    playlist = result.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    await db.delete(playlist)
    await db.commit()
    return None

@router.post("/import", response_model=PlaylistResponse)
async def import_playlist(request: ImportPlaylistRequest, db: AsyncSession = Depends(get_db)):
    # 1. Fetch info from YouTube
    info = await ytdlp_service.get_playlist_info(request.url)
    if not info:
        raise HTTPException(status_code=400, detail="Invalid playlist URL or extraction failed")
    
    # 2. Create Playlist
    new_playlist = Playlist(
        title=info['title'],
        description=f"Imported from YouTube (Original ID: {info['id']})",
        user_id=request.user_id 
    )
    db.add(new_playlist)
    await db.commit()
    await db.refresh(new_playlist)
    
    # 3. Add items
    # Note: Bulk insert would be faster, but for simple implementation loop is okay
    # For large playlists this might timeout, consider background task
    for idx, item in enumerate(info['items']):
        new_item = PlaylistItem(
            playlist_id=new_playlist.id,
            video_id=item['video_id'],
            title=item['title'],
            thumbnail=item['thumbnail'],
            duration=item['duration'],
            position=idx
        )
        db.add(new_item)
    
    await db.commit()
    return new_playlist
