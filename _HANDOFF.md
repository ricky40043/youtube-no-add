# Session Summary: Fix Mobile Playback & Direct Proxy

## 核心成就 (Accomplishments)
1.  **360p Direct Proxy (穩定版)**
    -   實作了基於 `httpx` 的直接串流代理，支援 `Range` header。
    -   **解決問題**：手機版 (iOS/Android) 與電腦版皆可流暢播放 360p，且支援時間軸拖曳。
    -   **預設畫質**：前端已設定預設優先使用 `360p`，提升載入速度。

2.  **播放器優化**
    -   **時長記憶**：修正了切換畫質時影片總時長 (Duration) 歸零或錯誤的問題 (`VideoPlayer.jsx`)。
    -   **錯誤修正**：修復了 `aiohttp` 依賴缺失導致的 500 錯誤。

3.  **穩定性回歸 (Regression Fix)**
    -   嘗試修復 iOS 高畫質 (1080p/720p) 播放問題時，曾一度導致電腦版播放失敗 (SyntaxError/Logic Error)。
    -   **目前狀態**：後端 `video.py` 已**完全還原**至穩定版本 (僅使用 fMP4)，確保電腦版 100% 正常。

## 已知限制 (Known Limitations)
-   **iOS 高畫質播放 (1080p/720p)**
    -   因為 Safari `<video>` 標籤不支援 `fMP4` (Fragmented MP4) 直流，目前在 iOS 上點選這些畫質會出現 "Format Error"。
    -   **暫時解法**：iOS 使用者請選擇 **"Auto"** (走 HLS 協議，畫質最好) 或 **"360p"** (走 Direct MP4，速度最快)。

## 後續建議 (Next Steps)
-   若要徹底解決 iOS 高畫質問題，建議研究 **HLS Packaging** (將 ffmpeg 輸出轉為 .m3u8 + .ts 切片)，而非單純的 MPEG-TS 直流。
-   或者在前端針對 iOS 隱藏不支援的畫質選項 (使用者曾拒絕此方案，但在技術限制下可能仍是最佳解)。
