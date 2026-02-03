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
    title: str  # API uses 'title' but maps to 'video_title' in DB
    thumbnail: str  # API uses 'thumbnail' but maps to 'video_thumbnail' in DB
    duration: int  # API uses 'duration' but maps to 'video_duration' in DB
    position: Optional[int] = 0  # API uses 'position' but maps to 'order_index' in DB

class PlaylistBase(BaseModel):
    title: str  # API uses 'title' but maps to 'name' in DB
    description: Optional[str] = None

class PlaylistCreate(PlaylistBase):
    user_id: int # Auth will inject this properly later

class ImportPlaylistRequest(BaseModel):
    url: str
    user_id: int # Mock auth for now

class PlaylistResponse(BaseModel):
    id: int
    user_id: int
    title: str  # This will be populated from 'name' field
    description: Optional[str] = None
    created_at: datetime
    items_count: int = 0  # Number of items in the playlist

    class Config:
        orm_mode = True
        
    @classmethod
    def from_orm(cls, obj, items_count: int = 0):
        return cls(
            id=obj.id,
            user_id=obj.user_id,
            title=obj.name,  # Map DB 'name' to API 'title'
            description=obj.description,
            created_at=obj.created_at,
            items_count=items_count
        )

class PlaylistItemResponse(BaseModel):
    id: int
    video_id: str
    title: str
    thumbnail: str
    duration: int
    position: int
    added_at: datetime
    
    class Config:
        orm_mode = True
        
    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=obj.id,
            video_id=obj.video_id,
            title=obj.video_title,  # Map DB 'video_title' to API 'title'
            thumbnail=obj.video_thumbnail,  # Map DB 'video_thumbnail' to API 'thumbnail'
            duration=obj.video_duration or 0,  # Map DB 'video_duration' to API 'duration'
            position=obj.order_index or 0,  # Map DB 'order_index' to API 'position'
            added_at=obj.added_at
        )

# CRUD Endpoints

@router.get("/", response_model=List[PlaylistResponse])
async def get_playlists(user_id: int, db: AsyncSession = Depends(get_db)):
    # TODO: Get user_id from auth token dependency
    result = await db.execute(
        select(Playlist)
        .filter(Playlist.user_id == user_id)
        .options(selectinload(Playlist.items))  # Load items to count them
    )
    playlists = result.scalars().all()
    return [PlaylistResponse.from_orm(p, items_count=len(p.items)) for p in playlists]

@router.post("/", response_model=PlaylistResponse)
async def create_playlist(playlist: PlaylistCreate, db: AsyncSession = Depends(get_db)):
    # Verify user exists (optional if FK valid)
    new_playlist = Playlist(
        name=playlist.title,  # Map API 'title' to DB 'name'
        description=playlist.description,
        user_id=playlist.user_id
    )
    db.add(new_playlist)
    await db.commit()
    await db.refresh(new_playlist)
    return PlaylistResponse.from_orm(new_playlist)

@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    playlist = result.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return PlaylistResponse.from_orm(playlist)

@router.get("/{playlist_id}/items", response_model=List[PlaylistItemResponse])
async def get_playlist_items(playlist_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaylistItem)
        .filter(PlaylistItem.playlist_id == playlist_id)
        .order_by(PlaylistItem.order_index)  # Changed from 'position' to 'order_index'
    )
    items = result.scalars().all()
    return [PlaylistItemResponse.from_orm(item) for item in items]

@router.post("/{playlist_id}/items", response_model=PlaylistItemResponse)
async def add_item_to_playlist(playlist_id: int, item: PlaylistItemBase, db: AsyncSession = Depends(get_db)):
    # Check if playlist exists
    playlist_result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    if not playlist_result.scalars().first():
        raise HTTPException(status_code=404, detail="Playlist not found")

    new_item = PlaylistItem(
        playlist_id=playlist_id,
        video_id=item.video_id,
        video_title=item.title,  # Map API 'title' to DB 'video_title'
        video_thumbnail=item.thumbnail,  # Map API 'thumbnail' to DB 'video_thumbnail'
        video_duration=item.duration,  # Map API 'duration' to DB 'video_duration'
        order_index=item.position  # Map API 'position' to DB 'order_index'
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return PlaylistItemResponse.from_orm(new_item)

@router.delete("/{playlist_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item_from_playlist(playlist_id: int, item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaylistItem).filter(
            PlaylistItem.id == item_id,
            PlaylistItem.playlist_id == playlist_id
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    await db.delete(item)
    await db.commit()
    return None


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    playlist = result.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    await db.delete(playlist)
    await db.commit()
    return None

class PlaylistUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

@router.put("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(playlist_id: int, update: PlaylistUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    playlist = result.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    if update.title is not None:
        playlist.name = update.title
    if update.description is not None:
        playlist.description = update.description
    
    await db.commit()
    await db.refresh(playlist)
    return PlaylistResponse.from_orm(playlist)

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
