# AGENTS.md - Agent Coding Guidelines

This file provides guidelines for AI agents working on this codebase.

## Project Overview

- **Project Name**: YouTube Alternative PWA
- **Stack**: Vite + React (Frontend) | Python FastAPI (Backend) | PostgreSQL + Redis (Database)
- **Purpose**: Ad-free YouTube alternative with background playback support

## Build / Lint / Test Commands

### Frontend (React + Vite)

```bash
cd frontend

# Development
npm run dev           # Start dev server at localhost:5173

# Production build
npm run build         # Build for production

# Linting
npm run lint          # Run ESLint on all files

# No test framework configured
```

### Backend (Python FastAPI)

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --port 8000

# Run with Docker
docker-compose up --build
```

### Running Tests

**Backend tests are standalone scripts** (not pytest):

```bash
cd backend

# Run specific test file
python test_video_quality.py
python test_clients.py
python test_ios_formats.py
python test_android_formats.py

# Example: Run a single test function
python -c "
import asyncio
from services.ytdlp_service import ytdlp_service

async def test():
    info = await ytdlp_service.get_video_info('jfKfPfyJRdk')
    print(info)

asyncio.run(test())
"
```

**No frontend test framework is configured.**

---

## Code Style Guidelines

### Python (Backend)

#### Imports
- Standard library first, then third-party, then local
- Group by: `from X import Y` (alphabetical within groups)
- Use absolute imports from project root

```python
# Good
import asyncio
import os
import re
from functools import partial
from typing import Optional, Dict, Any, List

import yt_dlp
from fastapi import APIRouter, HTTPException

from config import get_settings
from database.connection import Base
from services.cache_service import cache_service
from services.ytdlp_service import ytdlp_service
```

#### Naming Conventions
- **Functions/variables**: `snake_case` (e.g., `get_video_info`, `video_cache_ttl`)
- **Classes**: `PascalCase` (e.g., `YtDlpService`, `Settings`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_CACHE_TTL`)
- **Private methods**: Prefix with `_` (e.g., `_extract_streams`)

#### Type Annotations
- Use type hints for function parameters and return types
- Use `Optional[X]` instead of `X | None`

```python
async def get_video_info(video_id: str) -> Optional[Dict[str, Any]]:
    ...
```

#### Error Handling
- Use `try/except` blocks with specific exception types
- Re-raise HTTP exceptions with `raise HTTPException(status_code=..., detail=...)`
- Use `traceback.print_exc()` for debugging, log errors appropriately
- Return proper error responses (not just print)

```python
try:
    info = await ytdlp_service.get_video_info(video_id)
except Exception as e:
    print(f"yt-dlp error: {e}")  # For debugging
    return None
```

#### API Routes
- Use FastAPI's dependency injection for request objects
- Document endpoints with docstrings
- Use appropriate HTTP methods (GET for retrieval, POST for creation)

```python
@router.get("/info/{video_id}")
async def get_video_info(video_id: str):
    """
    Get video metadata
    
    - **video_id**: YouTube video ID or full URL
    """
    ...
```

#### Database Models (SQLAlchemy)
- Use declarative base from `database.connection`
- Define relationships with `back_populates`
- Use appropriate column types (`Integer`, `String`, `DateTime`, `JSON`, etc.)

```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    
    playlists = relationship("Playlist", back_populates="owner")
```

---

### JavaScript/React (Frontend)

#### Imports
- Group in order: React/core, third-party, local components/hooks/utils/services
- Use absolute imports based on project structure

```javascript
// Good
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

import VideoCard from '../components/VideoCard'
import { videoApi, searchApi } from '../services/api'
import { formatDate } from '../utils/date'
```

#### Naming Conventions
- **Components**: `PascalCase` (e.g., `VideoCard`, `SearchDropdown`)
- **Functions/variables**: `camelCase` (e.g., `fetchVideos`, `videoList`)
- **Constants**: `UPPER_SNAKE_CASE` or `camelCase` (e.g., `API_URL`, `activeTab`)

#### Components
- Use functional components with hooks
- Use `useState`, `useEffect`, `useCallback`, `useRef` as needed
- Extract reusable logic into custom hooks

```javascript
function Home() {
    const [videos, setVideos] = useState([])
    const [loading, setLoading] = useState(false)
    
    const fetchVideos = useCallback(async () => {
        setLoading(true)
        try {
            const data = await videoApi.getTrending()
            setVideos(data)
        } catch (err) {
            console.error('Failed to fetch:', err)
        } finally {
            setLoading(false)
        }
    }, [])
    
    useEffect(() => {
        fetchVideos()
    }, [fetchVideos])
    
    // ...
}
```

#### Error Handling
- Use try/catch with async/await
- Set error states for user feedback
- Log errors to console with meaningful messages

```javascript
try {
    const data = await videoApi.getInfo(videoId)
    setVideo(data)
} catch (err) {
    console.error('Failed to fetch video:', err)
    setError('無法載入影片')
}
```

#### Styling
- Use inline styles for dynamic values
- Use CSS variables defined in `index.css` (e.g., `var(--accent)`, `var(--text-secondary)`)
- Consider using CSS-in-JS patterns with `style={{}}` objects

---

### General Guidelines

1. **Environment Variables**: Store sensitive data in `.env` files, never commit them
2. **Caching**: Use Redis for caching with appropriate TTL
3. **Logging**: Use `print()` with `[DEBUG]` or `[ERROR]` prefixes for backend logging
4. **API Design**: Use RESTful patterns, plural nouns for collections (`/api/videos`, `/api/playlists`)
5. **Database**: Use async SQLAlchemy with asyncpg driver for PostgreSQL

---

### File Organization

```
backend/
├── main.py                 # FastAPI app entry point
├── config.py              # Settings/configuration
├── database/
│   ├── connection.py       # DB connection
│   └── models.py          # SQLAlchemy models
├── routers/               # API route handlers
│   ├── video.py
│   ├── search.py
│   ├── user.py
│   └── ...
└── services/              # Business logic
    ├── ytdlp_service.py
    ├── cache_service.py
    └── ...

frontend/
├── src/
│   ├── main.jsx           # React entry
│   ├── App.jsx            # Root component
│   ├── components/        # Reusable components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom hooks
│   ├── services/          # API calls
│   └── utils/             # Helper functions
└── package.json
```

---

### Common Patterns

#### Async/Await in Python
```python
async def fetch_data():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, blocking_function)
    return result
```

#### React Infinite Scroll
```javascript
const lastElementRef = useCallback(node => {
    if (loading) return
    if (observer.current) observer.current.disconnect()
    observer.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore) {
            loadMore()
        }
    })
    if (node) observer.current.observe(node)
}, [loading, hasMore])
```

---

### Notes for Agents

- This project uses **Chinese** for UI strings and some comments
- Tests in `backend/test_*.py` are manual testing scripts, not automated tests
- The backend uses yt-dlp for YouTube extraction and Invidious as fallback
- FFmpeg is required for video/audio merging on the backend
- Frontend proxies API calls through Vite dev server to avoid CORS
