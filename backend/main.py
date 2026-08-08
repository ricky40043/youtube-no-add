from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from routers import video, search, user, playlist, history, subscription, feed
from routers import download
from database.connection import init_db
from database.migrations import run_compatibility_migrations
import admin_panel

app = FastAPI(
    title="YouTube Alternative API",
    description="無廣告 YouTube 影片串流 API",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    await init_db()
    await run_compatibility_migrations()

# CORS configuration - Allow all origins for mobile testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(video.router, prefix="/api/video", tags=["Video"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(playlist.router, prefix="/api/playlists", tags=["Playlists"])
app.include_router(history.router, prefix="/api/history", tags=["History"])
app.include_router(subscription.router, prefix="/api/subscriptions", tags=["Subscriptions"])
app.include_router(feed.router, prefix="/api/feed", tags=["Feed"])

from routers.search_history import router as search_history_router
app.include_router(search_history_router, prefix="/api/search-history", tags=["SearchHistory"])
app.include_router(download.router, prefix="/api/download", tags=["Download"])

# 後台：唯讀資料表瀏覽器（/admin、/api/admin/*）
app.include_router(admin_panel.router, tags=["Admin"])


@app.get("/")
async def root(request: Request):
    # admin-youtube.* 子網域直接進後台
    host = request.headers.get("host", "")
    if host.startswith("admin"):
        return FileResponse(str(Path(__file__).resolve().parent / "admin.html"))
    return {"message": "YouTube Alternative API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
