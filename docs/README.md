# YouTube Alternative PWA - 技術文檔

## 目錄
1. [系統架構概述](#系統架構概述)
2. [資料庫模型關聯圖](#資料庫模型關聯圖)
3. [後端 API 功能說明與流程圖](#後端-api-功能說明與流程圖)
4. [前端 UI/UX 操作流程](#前端-uiux-操作流程)

---

## 系統架構概述

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  Home   │ │  Watch  │ │ Search  │ │History  │ │Playlists│ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
└───────┼──────────┼──────────┼──────────┼──────────┼──────────┘
        │           │          │          │          │
        └───────────┴──────────┴──────────┴──────────┘
                            │
                    Vite Proxy (5173)
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                       Backend (FastAPI)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │  Video   │ │  Search  │ │  User    │ │Playlist  │         │
│  │  Router  │ │  Router  │ │  Router  │ │  Router  │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└───────┼────────────┼────────────┼────────────┼────────────────┘
        │            │            │            │
   ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
   │ yt-dlp  │  │Invidious│  │SQLAlchemy│  │ Redis   │
   │ Service │  │ Service │  │   DB     │  │ Cache   │
   └─────────┘  └─────────┘  └──────────┘  └─────────┘
```

---

## 資料庫模型關聯圖

### ER 關聯圖

```mermaid
erDiagram
    USER ||--o{ PLAYLIST : owns
    USER ||--o{ WATCH_HISTORY : has
    USER ||--o{ SEARCH_HISTORY : has
    USER ||--o{ SUBSCRIPTION : has
    PLAYLIST ||--o{ PLAYLIST_ITEM : contains
    PLAYLIST_ITEM }o--|| VIDEO : references
    SUBSCRIPTION }o--|| CHANNEL : subscribes_to
    VIDEO }o--|| CHANNEL : belongs_to
    USER ||--o{ USER_TAG_AFFINITY : has_preferences

    USER {
        int id PK
        string username
        string password_hash
        datetime created_at
    }

    PLAYLIST {
        int id PK
        int user_id FK
        string name
        text description
        boolean is_public
        datetime created_at
        datetime updated_at
    }

    PLAYLIST_ITEM {
        int id PK
        int playlist_id FK
        string video_id
        string video_title
        string video_thumbnail
        string video_author
        int video_duration
        int order_index
        datetime added_at
    }

    WATCH_HISTORY {
        int id PK
        int user_id FK
        string video_id
        string video_title
        string video_thumbnail
        string video_author
        int video_duration
        datetime watched_at
        int progress_seconds
        int duration_watched
        float completion_rate
        string interaction_type
    }

    SEARCH_HISTORY {
        int id PK
        int user_id FK
        string query
        datetime searched_at
    }

    SUBSCRIPTION {
        int id PK
        int user_id FK
        string channel_id
        string channel_name
        string channel_thumbnail
        boolean notify_enabled
        datetime subscribed_at
    }

    CHANNEL {
        string id PK
        string title
        string thumbnail_url
        string uploads_playlist_id
        datetime last_fetched_at
    }

    VIDEO {
        string id PK
        string channel_id FK
        string title
        text description
        json tags
        string category_id
        datetime published_at
        int duration
        int view_count
    }

    USER_TAG_AFFINITY {
        int user_id PK
        string tag PK
        float score
        datetime last_updated
    }
```

### 資料表說明

| 資料表 | 用途說明 |
|--------|----------|
| `users` | 存放使用者帳號資訊 |
| `playlists` | 使用者建立的播放清單 |
| `playlist_items` | 播放清單中的影片項目 |
| `watch_history` | 使用者的觀看歷史記錄 |
| `search_history` | 使用者的搜尋歷史記錄 |
| `subscriptions` | 使用者訂閱的頻道 |
| `channels` | YouTube 頻道資訊快取 |
| `videos` | YouTube 影片資訊快取 |
| `user_tag_affinity` | 使用者興趣標籤親和度 |

---

## 後端 API 功能說明與流程圖

### API 路由總覽

```
/api/video     - 影片相關 API
/api/search     - 搜尋相關 API
/api/user      - 使用者認證 API
/api/playlists - 播放清單 API
/api/history   - 觀看歷史 API
/api/subscriptions - 訂閱相關 API
/api/feed      - 個人化推薦 API
/api/search-history - 搜尋歷史 API
```

---

### 1. Video API (`/api/video`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/info/{video_id}` | 獲取影片詳細資訊 |
| GET | `/stream/{video_id}` | 獲取串流 URL（重定向） |
| GET | `/audio/{video_id}` | 獲取純音訊串流（背景播放） |
| GET | `/merge` | 合併影片與音訊串流（FFmpeg） |
| GET | `/related/{video_id}` | 獲取相關影片推薦 |
| GET | `/proxy` | 代理外部內容（避免 CORS） |

#### 流程圖：獲取影片資訊

```mermaid
flowchart TD
    A[客戶端請求影片資訊] --> B{檢查快取?}
    B -->|是| C[返回快取資料]
    B -->|否| D[呼叫 yt-dlp 服務]
    D --> E{yt-dlp 成功?}
    E -->|是| F[解析並返回影片資訊]
    E -->|否| G[呼叫 Invidious 服務]
    G --> H{成功?}
    H -->|是| F
    H -->|否| I[返回 404 錯誤]
    F --> J[快取結果]
    J --> K[返回客戶端]
```

#### 流程圖：影片串流合併

```mermaid
flowchart TD
    A[客戶端請求合併串流] --> B{解析 ID}
    B --> C{有快取資料?}
    C -->|否| D[返回 404]
    C -->|是| E{直接串流?}
    E -->|是| F[建立 HTTP 代理]
    E -->|否| G[呼叫 FFmpeg]
    G --> H[合併影片+音訊]
    H --> I[串流輸出]
    F --> I
    I --> J[客戶端播放]
```

---

### 2. Search API (`/api/search`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/` | 搜尋 YouTube 影片 |
| GET | `/trending` | 獲取熱門影片 |
| GET | `/suggestions` | 獲取搜尋建議 |
| GET | `/related` | 獲取關聯推薦 |

#### 流程圖：搜尋影片

```mermaid
flowchart TD
    A[用戶輸入關鍵字] --> B[前端顯示下拉建議]
    B --> C[用戶提交搜尋]
    D[發送搜尋請求] --> E{檢查快取?}
    E -->|是| F[返回快取結果]
    E -->|否| G[呼叫 yt-dlp 搜尋]
    G --> H{成功?}
    H -->|是| I[解析搜尋結果]
    H -->|否| J[呼叫 Invidious 備用]
    I --> K[快取結果]
    J --> K
    K --> L[返回 JSON]
    L --> M[前端渲染影片卡片]
```

---

### 3. User API (`/api/user`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| POST | `/register` | 使用者註冊 |
| POST | `/login` | 使用者登入 |
| GET | `/me` | 取得當前用戶資訊 |

#### 流程圖：使用者認證

```mermaid
flowchart TD
    A[用戶打開 App] --> B{檢查本地 Token?}
    B -->|無| C[顯示登入/註冊頁面]
    B -->|有| D[攜帶 Token 請求 API]
    D --> E{Token 有效?}
    E -->|是| F[正常訪問]
    E -->|否| G[重新導向登入]
    
    C --> H[用戶輸入帳號密碼]
    H --> I{選擇動作}
    I -->|註冊| J[發送註冊請求]
    I -->|登入| K[發送登入請求]
    
    J --> L{成功?}
    K --> L
    L -->|是| M[儲存 Token 到本地]
    L -->|否| N[顯示錯誤訊息]
    M --> F
```

---

### 4. Playlist API (`/api/playlists`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/` | 取得用戶所有播放清單 |
| POST | `/` | 建立新播放清單 |
| GET | `/{playlist_id}` | 取得單一播放清單 |
| GET | `/{playlist_id}/items` | 取得播放清單項目 |
| POST | `/{playlist_id}/items` | 新增影片到播放清單 |
| DELETE | `/{playlist_id}/items/{item_id}` | 移除播放清單項目 |
| DELETE | `/{playlist_id}` | 刪除播放清單 |
| PUT | `/{playlist_id}` | 更新播放清單 |
| POST | `/import` | 匯入 YouTube 播放清單 |

#### 流程圖：新增影片到播放清單

```mermaid
flowchart TD
    A[觀看影片] --> B[點擊更多選項]
    B --> C[選擇加入播放清單]
    C --> D[顯示播放清單 Modal]
    D --> E[選擇現有或新建]
    E -->|現有| F[加入現有播放清單]
    E -->|新建| G[建立新播放清單]
    G --> F
    
    F --> H{成功?}
    H -->|是| I[顯示成功提示]
    H -->|否| J[顯示錯誤]
    I --> K[關閉 Modal]
```

---

### 5. History API (`/api/history`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/` | 取得觀看歷史 |
| POST | `/` | 新增觀看記錄 |
| DELETE | `/{user_id}/{video_id}` | 刪除單筆記錄 |
| DELETE | `/{user_id}/clear` | 清除所有歷史 |

#### 流程圖：記錄觀看歷史

```mermaid
flowchart TD
    A[用戶觀看影片] --> B{每 N 秒}
    B --> C[儲存進度]
    C --> D[發送歷史記錄請求]
    D --> E{已有記錄?}
    E -->|是| F[更新時間與進度]
    E -->|否| G[新增記錄]
    F --> H[完成]
    G --> H
```

---

### 6. Subscription API (`/api/subscriptions`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/` | 取得所有訂閱 |
| GET | `/status/{channel_id}` | 檢查訂閱狀態 |
| POST | `/` | 訂閱頻道 |
| DELETE | `/{channel_id}` | 取消訂閱 |
| GET | `/feed` | 取得訂閱更新動態 |
| PUT | `/{channel_id}/notify` | 切換通知 |
| GET | `/notifications` | 取得通知 |

#### 流程圖：訂閱頻道

```mermaid
flowchart TD
    A[觀看影片] --> B[點擊 訂閱 按钮]
    B --> C{已訂閱?}
    C -->|是| D[顯示已訂閱]
    C -->|否| E[POST /api/subscriptions]
    
    E --> F{成功?}
    F -->|Yes| G[背景任務同步頻道影片]
    F -->|No| H[顯示錯誤]
    
    G --> I[更新 UI 為已訂閱]
    I --> J[完成]
```

---

### 7. Feed API (`/api/feed`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/` | 取得個人化推薦 |
| POST | `/sync` | 手動觸發同步 |
| POST | `/refresh-profile` | 刷新興趣檔案 |

#### 流程圖：個人化推薦

```mermaid
flowchart TD
    A[首頁載入] --> B[請求推薦資料]
    B --> C{已登入?}
    C -->|是| D[取得觀看歷史]
    C -->|否| E[使用預設熱門]
    
    D --> F[提取關鍵字]
    F --> G[產生搜尋查詢]
    E --> G
    
    G --> H[並行搜尋多個關鍵字]
    H --> I[合併結果並去重]
    I --> J[隨機排序]
    J --> K[分頁返回]
    K --> L[前端渲染]
```

---

### 8. Search History API (`/api/search-history`)

#### API 端點

| 方法 | 路徑 | 功能說明 |
|------|------|----------|
| GET | `/` | 取得搜尋歷史 |
| POST | `/` | 新增搜尋記錄 |
| DELETE | `/` | 清除所有搜尋歷史 |
| DELETE | `/{id}` | 刪除單筆記錄 |

---

## 前端 UI/UX 操作流程

### 頁面結構

```
App
├── Navbar (頂部導航)
│   ├── 搜尋框
│   ├── Logo
│   └── 使用者頭像
├── Routes
│   ├── Home (首頁/推薦)
│   ├── Watch (觀看頁面)
│   ├── Search (搜尋結果)
│   ├── History (觀看歷史)
│   ├── Playlists (播放清單)
│   ├── PlaylistDetail (播放清單詳情)
│   ├── Subscriptions (訂閱列表)
│   ├── Notifications (通知)
│   ├── Profile (個人資料)
│   └── Auth (登入/註冊)
└── BottomNav (底部導航 - 行動版)
```

### 操作流程圖

#### 1. 首頁載入流程

```mermaid
flowchart TD
    A[App 啟動] --> B{檢查登入狀態}
    B -->|已登入| C[請求個人化推薦]
    B -->|未登入| D[請求熱門影片]
    
    C --> E[取得推薦資料]
    D --> F[取得熱門資料]
    
    E --> G[解析 JSON]
    F --> G
    
    G --> H[渲染影片卡片網格]
    H --> I[顯示載入狀態]
    I --> J[完成]
```

#### 2. 搜尋流程

```mermaid
flowchart TD
    A[點擊搜尋框] --> B[顯示熱門搜尋/歷史]
    B --> C[輸入關鍵字]
    C --> D[debounce 300ms]
    D --> E[取得搜尋建議]
    E --> F[顯示下拉建議]
    F --> G[選擇建議或按下搜尋]
    G --> H[執行搜尋]
    H --> I[顯示結果列表]
    I --> J[點擊影片卡片]
    J --> K[跳轉到觀看頁面]
```

#### 3. 觀看影片流程

```mermaid
flowchart TD
    A[點擊影片卡片] --> B[載入觀看頁面]
    B --> C[取得影片資訊]
    C --> D[取得相關影片]
    
    D --> E[渲染播放器與推薦]
    E --> F{自動播放?}
    F -->|是| G[開始播放]
    F -->|否| H[顯示縮圖]
    
    G --> I[每 10 秒儲存進度]
    I --> J[記錄觀看歷史]
    
    H --> K[點擊播放]
    K --> G
    
    J --> L{影片結束?}
    L -->|是| M[顯示相關影片]
    L -->|否| N[繼續播放]
```

#### 4. 播放清單流程

```mermaid
flowchart TD
    A[點擊底部導航播放清單] --> B[取得播放清單]
    B --> C[顯示播放清單卡片]
    C --> D[點擊播放清單]
    D --> E[取得播放清單項目]
    E --> F[顯示影片列表]
    
    F --> G[點擊播放]
    G --> H[開啟播放器]
    H --> I[自動播放下一首]
    
    F --> J[長按影片]
    J --> K[顯示選項 - 刪除/移動]
```

#### 5. 訂閱流程

```mermaid
flowchart TD
    A[觀看影片] --> B[點擊訂閱按钮]
    B --> C{已登入?}
    C -->|否| D[導向登入頁面]
    C -->|是| E[發送訂閱請求]
    
    E --> F{成功?}
    F -->|是| G[按鈕變更為 已訂閱]
    F -->|否| H[顯示錯誤]
    
    G --> I[背景同步頻道影片]
    I --> J[用戶可查看 更新動態]
    
    J --> K[點擊訂閱動態]
    K --> L[取得訂閱動態]
    L --> M[顯示最新影片]
```

---

### 底部導航 (BottomNav)

```mermaid
flowchart LR
    H[首頁] --> S[搜尋] --> Sub[訂閱] --> P[播放清單]
    H -->|點擊| R1[首頁]
    S -->|點擊| R2[搜尋頁面]
    Sub -->|點擊| R3[訂閱頁面]
    P -->|點擊| R4[播放清單頁面]
```

---

## 技術堆疊總覽

| 層面 | 技術 |
|------|------|
| 前端框架 | React 18 + Vite |
| 前端路由 | React Router v6 |
| 後端框架 | FastAPI (Python) |
| 資料庫 | PostgreSQL + SQLAlchemy (非同步) |
| 快取 | Redis |
| 影片擷取 | yt-dlp + Invidious |
| 影片處理 | FFmpeg |
| 認證 | JWT (Mock 實現) |

---

## 常見使用情境

### 情境 1：背景播放音樂
```
1. 用戶在 Watch 頁面
2. 切換到音訊模式
3. API: GET /api/video/audio/{video_id}
4. 返回純音訊 URL
5. 手機切到背景 Audio 繼續播放
```

### 情境 2：匯入 YouTube 播放清單
```
1. 用戶在 Playlists 頁面
2. 點擊 匯入
3. 貼上 YouTube 播放清單 URL
4. API: POST /api/playlists/import
5. 後端使用 yt-dlp 抓取所有影片
6. 建立本地播放清單
```

### 情境 3：個人化推薦
```
1. 用戶觀看越多影片
2. 系統記錄觀看歷史與標籤
3. API: GET /api/feed
4. 基於興趣標籤搜尋相關影片
5. 返回個人化推薦列表
```

---

## 附錄：環境變數

```
# Backend
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
JWT_SECRET=your-secret-key

# Frontend (Vite)
VITE_API_URL=http://localhost:8000
```

---

*文檔版本: 1.0.0*
*最後更新: 2026-02-22*
