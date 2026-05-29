# 播放器與訂閱 改善 Spec（第二輪）

> 日期：2026-05-30
> 來源：使用者在 youtube.ricky-nova.com 實測回報
> 多數修改集中在自訂播放器 `frontend/src/components/VideoPlayer.jsx`（即「音樂模式 / Proxy 模式」，非預設的 YouTube 嵌入模式）

---

## 問題清單與狀態

- [x] **#1 訂閱通知抓不到影片**：訂閱頻道 24h 內有新片卻看不到。
- [x] **#2 訂閱頁文字爆版**：頻道名稱過長溢出、蓋住鈴鐺與「取消訂閱」。
- [x] **#3 手機音樂模式無法按「上一首」** → 控制列加 ⏮⏭ 按鈕 + MediaSession 鎖屏切換。
- [x] **#4 音樂模式底下時間條非常難拉** → 進度條 `touch-action:none` + 手機加大。
- [x] **#5 音樂模式無法雙擊快轉/快退 5 秒** → 封面區加雙擊左/右 ±5 秒。
- [x] **#6 缺少單曲循環** → 控制列加 🔁 切換，開啟時重播當前曲、不換下一首。
- [x] **#7（問題）靜音時換下一首能否出聲** → 已於下方說明（iOS 平台行為，非 bug）。

---

## #1 訂閱通知 / 訂閱內容（已修，待部署）

根因：`get_channel_latest_videos` 用完整解析抓頻道影片，頻道最上面只要有一支「即將首播 premiere」就會整批中斷回空陣列；加上舊版「通知」依賴 DB 同步 + 鈴鐺開 + 7 天三重條件。

已修（在分支 `feat/search-subs-recommend-improvements`）：
- `ytdlp_service.get_channel_latest_videos` 加 `ignoreerrors=True`，跳過首播/會員/年齡限制等問題影片。
- 「訂閱內容」頁 (`Subscriptions.jsx`) 新增「最新影片」區塊，串 `/subscriptions/feed` 即時顯示所有訂閱頻道近期影片。
- `/subscriptions/notifications` 改為即時抓取近 7 天上傳並快取，不再依賴 DB 同步。

> 尚未部署到線上，需合併 PR 進 main 觸發部署後才看得到。

## #2 訂閱卡片文字爆版（已修，待部署）

根因：flex 子層 `.channel-details` 沒有 `min-width:0`，導致 `text-overflow: ellipsis` 失效。
已修：加 `min-width:0` 與 `.card-actions { flex-shrink:0 }`（`Subscriptions.jsx`）。

---

## #3 手機音樂模式無法按「上一首」

現況：上一首/下一首只有兩個半透明的左右圓形 `nav-overlay`（`opacity:0.6`），在手機上容易誤觸成播放/暫停，或被封面圖層擋住，且沒有歷史時 `goToPrevVideo` 直接無作用 → 感覺「按不到」。

改法（`VideoPlayer.jsx`）：
1. 在底部控制列 `.player-controls` 內，play/pause 兩側加上明確的 **⏮ 上一首 / ⏭ 下一首** 按鈕（大觸控區，永遠可見），分別接 `onPrev` / `onNext`。
2. 同時把 `onPrevious`/`onNext` 接進 `useMediaSession` → 手機鎖屏 / 耳機線控也能切換上一首/下一首。

## #4 音樂模式時間條難拖拉

根因：`.progress-container` 的 `onTouchMove` 沒有阻止瀏覽器把拖曳當成「捲動頁面」，導致 touchmove 不連續、拉不動。

改法（`VideoPlayer.jsx`）：
1. `.progress-container` 加 `touch-action: none`（告訴瀏覽器這塊自己處理觸控、不要捲動）。
2. `handleTouchSeek` 內加 `e.preventDefault()`。
3. 音樂模式下加大進度條與可點區（手機）。

## #5 音樂模式加雙擊左/右 ±5 秒

現況：雙擊快轉/快退邏輯只綁在影片模式的 `.player-wrapper`（`handleTouchEnd`）；音樂模式的 `.audio-player` 只有單擊播放/暫停。

改法（`VideoPlayer.jsx`）：把雙擊偵測（左 1/3 → 退 5 秒、右 1/3 → 進 5 秒、中間 → 播放/暫停）也加到音樂模式的封面區，沿用既有 `handleSeekBackward/Forward` 與 `feedback` 動畫。

## #6 單曲循環

改法（`VideoPlayer.jsx`）：
1. 新增 `loopMode` 狀態（存 localStorage），控制列加 🔁 切換鈕（開啟時高亮）。
2. `handleEndedEvent`：若 `loopMode` 開 → 將目前 media `currentTime=0` 重新播放、**不**呼叫 `onEnded`（不換下一首）；關閉時維持原本換下一首邏輯。
3. 用 `loopRef` 避免 stale closure。

## #7（問題）手機靜音時換下一首能否繼續出聲

說明：這是 **iOS 平台行為**，不是程式 bug。iOS 上 HTML5 `<audio>/<video>` 受手機側邊「靜音實體開關」影響；同一個使用者手勢內持續播放通常還會出聲，但換下一首重新 `load()` 新來源時，有機會被靜音開關擋住 → 「有時可、有時不可」。

現況已有緩解：換片時 `handleEndedEvent` 會先播一段 base64 無聲 MP3 spacer 維持 audio session。

可行的進一步作法（較大、列為後續評估，不在本輪實作）：改用 Web Audio API（`AudioContext`）輸出，可在靜音開關開啟時仍出聲；但需重寫音訊輸出管線、風險較高。本輪先把 #3–#6 做完並保留現有 spacer 緩解。

---

## 驗證
- 桌面 Chrome：切換到 🎧 音樂模式 → 控制列出現 ⏮⏭🔁；點 ⏭/⏮ 可換片；🔁 開啟後單曲重播；拖時間條順暢；鍵盤左右鍵 ±5 秒仍正常。
- 手機（iOS Safari / Android Chrome）：音樂模式可點上一首/下一首；時間條可順暢拖拉；封面區雙擊左右 ±5 秒；鎖屏控制可上一首/下一首。
- `npm run build` 通過。
