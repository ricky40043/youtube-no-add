# Session Handoff: Player Debugging & Proxy Fixes

## Summary
Successfully resolved critical issues preventing high-quality video playback and causing extensive error logs.

## Solved Issues
1.  **500 Internal Server Error (Long URLs)**:
    -   **Problem**: Frontend Proxy (Vite) crashed when handling extremely long Google Video URLs.
    -   **Fix**: Implemented **Short IDs** in Backend (`ytdlp_service.py`).
        -   Backend now caches long URLs in Redis and returns a short GUID (e.g. `?id=abc-123`).
        -   `VideoPlayer` uses this short ID to request the stream.
2.  **Proxy Connection Refused**:
    -   **Problem**: `vite.config.js` was pointing to `localhost:8000` (which is the frontend container itself in Docker), causing connection refusal.
    -   **Fix**: Updated `vite.config.js` to point to `http://backend:8000` (Docker DNS).
3.  **Infinite Duration / Seek Crash**:
    -   **Problem**: Proxy streams (chunked) don't have a content length, causing `duration = Infinity` and crashes in UI.
    -   **Fix**: Modified `VideoPlayer.jsx` to fallback to metadata duration when stream duration is infinite. Added guards for `NaN` in seek logic.
4.  **Autoplay Error**:
    -   **Clarification**: Explained `NotAllowedError` as standard browser autoplay policy.

## Modified Files
-   `backend/services/ytdlp_service.py`: Added Short ID generation & Cache storage.
-   `backend/routers/video.py`: Updated `/merge` endpoint to accept `id` param.
-   `frontend/vite.config.js`: Fixed proxy target.
-   `frontend/src/components/VideoPlayer.jsx`: Duration fallback and safe seek logic.

## Next Steps
-   **Seeking Optimization**: The current proxy uses `ffmpeg` on-the-fly. Seeking might be slow or restart the video depending on backend range support. Future work could implement `Range` header support in the proxy.
-   **Frontend Cleanup**: Remove debug logs if any remain.
