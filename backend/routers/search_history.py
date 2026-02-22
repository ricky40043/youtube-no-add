from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
from pydantic import BaseModel

from database.connection import get_db
from database.models import SearchHistory, User
from routers.user import get_current_user

router = APIRouter()

class SearchHistoryResponse(BaseModel):
    id: int
    query: str
    searched_at: str

@router.get("", response_model=List[SearchHistoryResponse])
async def get_search_history(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's search history"""
    stmt = (
        select(SearchHistory)
        .where(SearchHistory.user_id == current_user.id)
        .order_by(SearchHistory.searched_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return [
        SearchHistoryResponse(
            id=item.id,
            query=item.query,
            searched_at=item.searched_at.isoformat()
        )
        for item in items
    ]

@router.post("")
async def add_search_history(
    query: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add search to history"""
    # Remove duplicates - delete old entries with same query
    stmt = (
        SearchHistory.__table__.delete()
        .where(SearchHistory.user_id == current_user.id)
        .where(SearchHistory.query == query)
    )
    await db.execute(stmt)
    
    # Add new entry
    new_history = SearchHistory(user_id=current_user.id, query=query)
    db.add(new_history)
    await db.commit()
    
    return {"status": "added"}

@router.delete("")
async def clear_search_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clear user's search history"""
    stmt = SearchHistory.__table__.delete().where(SearchHistory.user_id == current_user.id)
    await db.execute(stmt)
    await db.commit()
    
    return {"status": "cleared"}

@router.delete("/{history_id}")
async def delete_search_history(
    history_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a specific search history item"""
    stmt = (
        SearchHistory.__table__.delete()
        .where(SearchHistory.id == history_id)
        .where(SearchHistory.user_id == current_user.id)
    )
    await db.execute(stmt)
    await db.commit()
    
    return {"status": "deleted"}
