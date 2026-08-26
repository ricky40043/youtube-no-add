import asyncio
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()

DOWNLOADS_DIR = Path("/app/downloads")
DOWNLOADS_DIR.mkdir(exist_ok=True)

# In-memory job status store
_jobs: dict = {}


class DownloadRequest(BaseModel):
    video_id: str
    type: str  # "audio" or "video"
    title: Optional[str] = "download"


def _get_job(job_id: str) -> dict:
    return _jobs.get(job_id, {})


def _update_job(job_id: str, data: dict):
    if job_id not in _jobs:
        _jobs[job_id] = {}
    _jobs[job_id].update(data)


def _run_download(job_id: str, video_id: str, dl_type: str, title: str):
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    ffmpeg_path = shutil.which("ffmpeg")

    try:
        _update_job(job_id, {"status": "downloading", "progress": 10, "message": "正在連接 YouTube..."})

        if dl_type == "audio":
            output_template = str(DOWNLOADS_DIR / f"{job_id}.%(ext)s")
            cmd = [
                "yt-dlp",
                "--js-runtimes", "deno",
                "-f", "bestaudio/best",
                "-x", "--audio-format", "mp3",
                "--no-playlist",
                "-o", output_template,
                # 不指定 player_client，改用 yt-dlp 預設。YouTube 已封鎖純 android
                # client（只會回 storyboard 圖片、拿不到音訊/影片格式），寫死它會讓下載失敗。
                "--no-progress",
                "--no-warnings",
            ]
        else:
            output_template = str(DOWNLOADS_DIR / f"{job_id}.%(ext)s")
            cmd = [
                "yt-dlp",
                "--js-runtimes", "deno",
                "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
                "--merge-output-format", "mp4",
                "--no-playlist",
                "-o", output_template,
                # 不指定 player_client，改用 yt-dlp 預設。YouTube 已封鎖純 android
                # client（只會回 storyboard 圖片、拿不到音訊/影片格式），寫死它會讓下載失敗。
                "--no-progress",
                "--no-warnings",
            ]

        if ffmpeg_path:
            cmd.extend(["--ffmpeg-location", ffmpeg_path])

        cookies_path = Path("/app/cookies.txt")
        if cookies_path.exists():
            cmd.extend(["--cookies", str(cookies_path)])

        cmd.append(youtube_url)

        _update_job(job_id, {"progress": 30, "message": "正在下載中..."})

        import subprocess
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            raise Exception(f"下載失敗: {result.stdout[-300:]}")

        found = [f for f in DOWNLOADS_DIR.glob(f"{job_id}.*") if f.suffix not in (".log",)]
        if not found:
            raise Exception("找不到下載完成的檔案")

        ext = found[0].suffix
        safe_title = "".join(c for c in title if c.isalnum() or c in " _-").strip() or "download"
        _update_job(job_id, {
            "status": "completed",
            "progress": 100,
            "message": "下載完成！",
            "ext": ext,
            "filename": f"{safe_title}{ext}",
        })

    except subprocess.TimeoutExpired:
        _update_job(job_id, {"status": "error", "message": "下載逾時，請稍後再試"})
    except Exception as e:
        _update_job(job_id, {"status": "error", "message": str(e)})


@router.post("/start")
async def start_download(request: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())[:8]
    _update_job(job_id, {"status": "pending", "progress": 0, "message": "等待下載...", "type": request.type})
    background_tasks.add_task(_run_download, job_id, request.video_id, request.type, request.title or "download")
    return {"job_id": job_id, "status": "pending"}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = _get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="找不到任務")
    return job


@router.get("/file/{job_id}")
async def download_file(job_id: str):
    job = _get_job(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="檔案尚未準備好")

    ext = job.get("ext", "")
    filename = job.get("filename", f"download{ext}")
    file_path = DOWNLOADS_DIR / f"{job_id}{ext}"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="檔案不存在")

    # NOTE: Do NOT set Content-Disposition manually here. HTTP headers must be
    # Latin-1 encodable, but `filename` can contain CJK/emoji (from the video
    # title) -> manual header crashes the response with 500 ("Internal Server
    # Error", 21 bytes). Starlette's FileResponse handles non-ASCII filenames
    # correctly via RFC 5987 (filename*=utf-8'') when given `filename=`.
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream",
    )
