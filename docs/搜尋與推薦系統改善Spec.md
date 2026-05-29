# 搜尋／訂閱／首頁推薦／相關影片 改善 Spec

> 日期：2026-05-29
> 範圍：搜尋優化、小鈴鐺／訂閱、首頁推薦、觀看頁相關影片
> 路線：務實強化現有 yt-dlp + Invidious 架構（不引入全文索引／embedding）

---

## 背景與目標

使用者回報四個體驗硬傷，經程式碼追查皆為**真實的後端邏輯缺陷**（非單純樣式問題）：

1. **搜尋**：排序與分頁體驗差、關聯推薦只是亂數洗牌。
2. **小鈴鐺／訂閱**：訂閱頻道後抓不到那些頻道的新片，形同壞掉。
3. **首頁推薦**：登入後「✨ 為您推薦」常常整片空白。
4. **觀看頁相關影片**：數量少、關聯性低、常常整排同一個人，無法用。

目標是在不大改架構的前提下，讓四個功能「有內容、關聯合理、分頁順暢」。

---

## 根因總表（已逐一驗證）

| 功能 | 真正根因 | 位置 |
|------|---------|------|
| 搜尋排序差 | yt-dlp 回傳的是 YouTube 關聯度排序，但 service **強制改用 view_count 由大到小重排**，破壞關聯性 | `backend/services/ytdlp_service.py:364` |
| 搜尋分頁慢/重複 | offset 分頁每翻一頁就重跑整個 `ytsearchN`（`playliststart/end`），慢且易漂移重複 | `backend/routers/search.py:32`、`ytdlp_service.py:305-369` |
| 搜尋關聯推薦弱 | `/search/related` 只把多次搜尋結果 `random.shuffle` 後切片，無關聯度排序 | `backend/routers/search.py:94-149` |
| 小鈴鐺抓不到片 | ① `notify_enabled` 訂閱時**預設 False**；② `/notifications` 同時要求「鈴鐺開」+「影片已同步進 DB」+「7 天內發布」三條件都成立；③ 前端只呼叫 `getNotifications()`，**從未呼叫**已寫好的 `/subscriptions/feed` | `backend/routers/subscription.py:20,96,216-272`、`frontend/src/pages/Home.jsx:91` |
| 同步進來的片被濾掉 | `get_channel_latest_videos` 回的 `published_at` 是 `YYYY-MM-DD`（長度 10），但 sync 只在 `len==8` 時解析 → 其餘寫成 `datetime(1970,1,1)` → 被 7 天視窗濾掉 | `backend/services/sync_service.py:170-180`、`ytdlp_service.py:416-429,580` |
| 首頁推薦空白 | feed 全靠「觀看紀錄標題 + 興趣 tag」造 query；新用戶/低紀錄 → `search_queries` 為空 → 不搜尋 → 回空陣列；**無冷啟動 fallback**，且空結果還被快取 5–10 分 | `backend/routers/feed.py:84-185` |
| 相關影片少/同頻道洗版 | 5 策略只跑 3 個（channel、category 被關掉）；author 用頻道名搜尋 → 回該頻道自己的片 →「整排同一人」；`view_count/1M` 權重讓爆紅片壓過相關片；TF-IDF 引擎沒被用到；且有重複/死碼 | `backend/routers/video.py:404-448` |

---

## 功能一：搜尋優化

**改法（後端為主）**

1. **修正排序**：移除 `ytdlp_service.search()` 末端的 `view_count` 強制重排（`ytdlp_service.py:364`），保留 yt-dlp 原生關聯度排序；新增可選 `sort` 參數（`relevance`(預設)/`date`/`views`），由前端決定。
2. **結果集快取 + 記憶體分頁**：仿照相關影片 (`video.py`) 做法，第一次抓較大一批（約 50 筆）存 `search:{q}:full`，後續分頁直接在記憶體切片，避免每頁重跑 yt-dlp，並消除翻頁重複與漂移。
3. **平行來源**：yt-dlp 與 `invidious_service.search()` 互補補滿結果（目前 Invidious 只在 offset=0 且失敗才用）。
4. **強化 `/search/related`**：用 jieba 關鍵字對候選做**關聯度排序**（標題關鍵字重疊度為主、view_count 為輔），取代 `random.shuffle`。
5. **建議詞**：`/suggestions` 去重後保留較完整字串、依長度/熱度排序。

**涉及檔案**：`backend/services/ytdlp_service.py`、`backend/routers/search.py`、`frontend/src/services/api.js`、`frontend/src/pages/Search.jsx`。

---

## 功能二：訂閱內容動態（小鈴鐺修復）

方向：把首頁訂閱體驗改成**像 YouTube 訂閱頁**——即時列出所有已訂閱頻道的最新片，不再依賴「鈴鐺開 + 已同步 + 7 天內」三重條件。

**改法**

1. **新增「📺 訂閱內容」分頁**：`Home.jsx` tab 改為 `recommended | subscriptions | trending`（保留 `notifications` 鈴鐺為輔），訂閱分頁呼叫**已存在但未被使用**的 `subscriptionApi.getFeed()` → `/subscriptions/feed`（會即時抓所有訂閱頻道最新片並依日期排序）。
2. **後端 `/subscriptions/feed` 補強**：加 Redis 快取（key 含 user_id，TTL 約 5–10 分）、提高頻道上限並沿用 `asyncio.gather` 平行抓；重用 `ytdlp_service.get_channel_latest_videos()`。
3. **訂閱即預設開鈴鐺**：`SubscriptionCreate.notify_enabled` 預設改 `True`，讓「最新通知」分頁也有資料。
4. **修同步日期 bug**：`sync_service` 改為接受 `YYYY-MM-DD`（`_format_date` 實際輸出），無法解析時 fallback 用 `utcnow()` 而非 1970，避免新片被 7 天視窗濾掉。

**涉及檔案**：`frontend/src/pages/Home.jsx`、`backend/routers/subscription.py`、`backend/services/sync_service.py`。

---

## 功能三：首頁推薦冷啟動修復

**改法（後端 `feed.py` 為主）**

1. **冷啟動 fallback**：當 `search_queries` 為空，或搜尋後結果過少時，補上 `invidious_service.get_trending('TW')` 作為墊底；新用戶也能立刻看到推薦。
2. **預設種子 query**：混入一組多領域通用熱門關鍵字，提升多樣性。
3. **不要快取空結果**：items 為空時不快取（或極短 TTL），避免把空白鎖住 5–10 分鐘。

**涉及檔案**：`backend/routers/feed.py`、（重用）`backend/services/invidious_service.py`。

---

## 功能四：觀看頁相關影片強化

**改法（後端 `video.py` 為主）**

1. **清理重複/死碼**：移除 `video.py:404-439` 重複定義的 `strategy_clean_title` 與孤兒 `try`。
2. **啟用全部策略並行**：`asyncio.gather` 同時跑 `channel / tags / category / clean_title / author`。
3. **來源配額，防同頻道洗版**：對「同頻道 / author 自己頻道」設上限（最多 3–4 部），確保來源多元。
4. **務實關聯度排序**：以「原片標題/標籤關鍵字 ↔ 候選標題重疊度」為主分數，view_count 僅次要加權（降低 `view_count/1M` 的支配力）；保留小幅 jitter。
5. **數量保底**：合併後不足時，用 category/trending 補滿到 ≥ 12 部。
6. **前端**：`Watch.jsx` 在相關影片為空時顯示 fallback，並修正「無法載入更多」語意。

**涉及檔案**：`backend/routers/video.py`、（重用）`backend/services/recommendation_service.py`、`frontend/src/pages/Watch.jsx`。

---

## 實作順序

1. 撰寫本 spec。
2. 功能二（訂閱內容）＋功能三（首頁冷啟動）— 影響「整片空白」最痛，優先。
3. 功能四（相關影片）。
4. 功能一（搜尋排序/分頁/關聯推薦）。

---

## 驗證計畫（end-to-end）

啟動：後端 `cd backend && uvicorn main:app --reload --port 8000`；前端 `cd frontend && npm run dev`（localhost:5173）；需 Redis/Postgres（`docker-compose up`）。無自動化測試框架，採手動 + `python -c` 腳本（見 AGENTS.md）。

- **搜尋**：搜同一關鍵字，首屏更貼近關鍵字（非只看最高觀看）；滑到底連續翻頁不重複、不卡頓；`/api/search/related?q=...` 與關鍵字相關（非亂序）。
- **訂閱內容**：登入 → 訂閱 1–2 個近期有更新的頻道 → 「📺 訂閱內容」分頁應即時列出最新片（不需手動同步、不限 7 天）。`curl localhost:8000/api/subscriptions/feed`（帶 token）驗證後端。
- **首頁推薦**：用**全新帳號（無觀看紀錄）**登入 → 「✨ 為您推薦」應有 trending fallback，不再空白；觀看幾部後重整轉為個人化。
- **相關影片**：開一部片 → 側欄 ≥ 12 部、來源多元（同頻道 ≤ 3–4 部）、關聯度合理；重整因 jitter 順序略變；後端 log 應顯示 5 個策略都有跑。
