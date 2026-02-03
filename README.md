# YouTube Alternative PWA

無廣告、支援背景播放的類 YouTube 網頁應用程式

## 🚀 快速開始

## 🚀 快速開始

### ⚡️ 一鍵啟動 (推薦)

我們提供了懶人腳本，幫您自動完成環境建置與啟動：

**Mac / Linux:**
```bash
./setup.sh  # 第一次執行 (建置環境)
./start.sh  # 日常啟動
```

**Windows:**
1. 雙擊 `setup.bat` (第一次執行)
2. 雙擊 `start.bat` (日常啟動)

### 手動啟動 (Docker Compose)

```bash
# 建置並啟動所有服務
docker-compose up --build

# 或在背景執行
docker-compose up -d --build
```

啟動後訪問：
- **前端**: http://localhost:5173
- **後端 API**: http://localhost:8000
- **API 文件**: http://localhost:8000/docs

### 停止服務

```bash
docker-compose down

# 若要清除資料
docker-compose down -v
```

## 🏗️ 專案結構

```
youtube-no-add/
├── docker-compose.yml      # Docker 編排
├── .env                    # 環境變數
├── frontend/               # Vite + React 前端
│   ├── src/
│   │   ├── components/     # React 組件
│   │   ├── pages/          # 頁面組件
│   │   ├── hooks/          # 自定義 Hooks
│   │   └── services/       # API 服務
│   └── Dockerfile
├── backend/                # Python FastAPI 後端
│   ├── routers/            # API 路由
│   ├── services/           # 業務邏輯服務
│   └── Dockerfile
└── scripts/
    └── init-db.sql         # 資料庫初始化
```

## ✨ 功能

### 第一階段 (MVP) ✅
- [x] 影片搜尋與播放
- [x] 無廣告串流
- [x] 背景播放（Media Session API）
- [x] 鎖定螢幕控制

### 第二階段（規劃中）
- [ ] 用戶註冊/登入
- [ ] 觀看紀錄
- [ ] 播放清單管理

## 🛠️ 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | Vite + React + Framer Motion |
| 後端 | Python FastAPI |
| 影片解析 | yt-dlp + Invidious API |
| 資料庫 | PostgreSQL + Redis |
| 部署 | Docker Compose |

## 📝 API 端點

### 影片
- `GET /api/video/info/{video_id}` - 獲取影片資訊
- `GET /api/video/audio/{video_id}` - 獲取音訊串流 URL
- `GET /api/video/stream/{video_id}` - 獲取影片串流

### 搜尋
- `GET /api/search?q={query}` - 搜尋影片
- `GET /api/search/trending` - 熱門影片

## ⚠️ 注意事項

此專案僅供學習與個人使用。請遵守 YouTube 的服務條款。
