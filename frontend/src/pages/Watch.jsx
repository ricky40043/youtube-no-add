import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { formatTimeAgo } from '../utils/date'
import VideoPlayer from '../components/VideoPlayer'
import VideoCard from '../components/VideoCard'
import AddToPlaylistModal from '../components/AddToPlaylistModal'
import { videoApi, historyApi, authApi, playlistApi, subscriptionApi } from '../services/api'
import YouTube from 'react-youtube'

function Watch() {
    const { videoId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const searchParams = new URLSearchParams(location.search)
    const playlistId = searchParams.get('list')
    const initialIndex = parseInt(searchParams.get('index') || '0')

    const [videoInfo, setVideoInfo] = useState(null)
    const [audioUrl, setAudioUrl] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [playlistError, setPlaylistError] = useState(null) // New error state
    const [showPlaylistModal, setShowPlaylistModal] = useState(false)
    const [useEmbed, setUseEmbed] = useState(true) // Default to Embed mode for better compatibility
    const [embedError, setEmbedError] = useState(false)

    const onPlayerReady = (event) => {
        // access to player in all event handlers via event.target
    }

    const onPlayerError = (e) => {
        console.error('YouTube Player Error:', e.data)
        setEmbedError(true)
    }

    const onPlayerStateChange = (e) => {
        // If playing (1) or buffering (3), clear error
        if (e.data === 1 || e.data === 3) {
            setEmbedError(false)
        }
    }

    const embedOpts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
        },
    }

    // Playlist state
    const [playlistItems, setPlaylistItems] = useState([])
    const [playlistTitle, setPlaylistTitle] = useState('')
    const [currentIndex, setCurrentIndex] = useState(initialIndex)
    const [isShuffle, setIsShuffle] = useState(false)
    const [shuffledIndices, setShuffledIndices] = useState([])

    // Related videos state (for auto-play when no playlist)
    const [relatedVideos, setRelatedVideos] = useState([])
    const [loadingRelated, setLoadingRelated] = useState(false)

    // Subscription State
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [notifyEnabled, setNotifyEnabled] = useState(false)

    // Check subscription status
    useEffect(() => {
        if (!videoInfo?.channel_id || !authApi.getCurrentUser()) {
            setIsSubscribed(false)
            return
        }

        subscriptionApi.checkStatus(videoInfo.channel_id)
            .then(res => {
                setIsSubscribed(res.is_subscribed)
                setNotifyEnabled(res.notify_enabled)
            })
            .catch(err => console.error("Failed to check subscription:", err))
    }, [videoInfo])

    // Handle Subscribe
    const handleSubscribe = async () => {
        const user = authApi.getCurrentUser()
        if (!user) {
            navigate('/auth')
            return
        }

        try {
            if (isSubscribed) {
                await subscriptionApi.unsubscribe(videoInfo.channel_id)
                setIsSubscribed(false)
            } else {
                await subscriptionApi.subscribe({
                    channel_id: videoInfo.channel_id,
                    channel_name: videoInfo.author,
                    channel_thumbnail: videoInfo.author_thumbnail
                })
                setIsSubscribed(true)

                // Auto-sync feed
                import('../services/api').then(({ feedApi }) => {
                    console.log('Auto-syncing feed...')
                    feedApi.sync().catch(console.error)
                })
            }
        } catch (err) {
            console.error(err)
            alert('操作失敗，請稍後再試')
        }
    }

    const handleToggleNotify = async () => {
        try {
            const res = await subscriptionApi.toggleNotification(videoInfo.channel_id)
            setNotifyEnabled(res.notify_enabled)
        } catch (err) {
            console.error(err)
            alert('操作失敗')
        }
    }

    // Fetch Playlist Data
    useEffect(() => {
        if (!playlistId) return

        const fetchPlaylist = async () => {
            console.log('[Watch] Fetching playlist:', playlistId)
            try {
                setPlaylistError(null)
                // We don't have a direct "get playlist info" that returns items + title conveniently in one go for generic lists
                // But for now let's assume we can get items.
                // If it's a Youtube import, we stored it in DB.
                const items = await playlistApi.getItems(playlistId)
                console.log('[Watch] Playlist loaded, count:', items?.length)
                if (Array.isArray(items)) {
                    setPlaylistItems(items)
                } else {
                    throw new Error('Invalid playlist response')
                }

                // Also try to get title
                try {
                    const playlists = await playlistApi.getAll(authApi.getCurrentUser()?.id)
                    const currentList = playlists.find(p => p.id.toString() === playlistId)
                    if (currentList) setPlaylistTitle(currentList.title)
                } catch (e) {
                    // ignore title fetch error if transient
                    if (!playlistTitle) setPlaylistTitle(`Playlist ${playlistId}`)
                }

            } catch (err) {
                console.error("Failed to load playlist", err)
                setPlaylistError(err.message || '無法載入播放清單')
            }
        }
        fetchPlaylist()
    }, [playlistId])

    // Generate shuffled indices when shuffle is toggled or items change
    useEffect(() => {
        if (!playlistItems.length) return
        if (isShuffle) {
            const indices = playlistItems.map((_, i) => i)
            // Fisher-Yates shuffle
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            // Ensure current video is first if possible, or just play through
            setShuffledIndices(indices)
        } else {
            setShuffledIndices([])
        }
    }, [isShuffle, playlistItems])

    useEffect(() => {
        const fetchVideo = async () => {
            if (!videoId) return

            try {
                setLoading(true)
                setError(null)

                // Fetch video info
                const info = await videoApi.getInfo(videoId)
                console.log('[Watch] Info received:', info?.title)
                setVideoInfo(info)

                // Also get audio URL
                try {
                    const audio = await videoApi.getAudioUrl(videoId)
                    setAudioUrl(audio)
                } catch {
                    // ignore
                }


                // Fetch related videos (background)
                if (!playlistId) {
                    setLoadingRelated(true)
                    videoApi.getRelated(videoId)
                        .then(related => {
                            console.log('[Watch] Related videos loaded:', related.length)
                            setRelatedVideos(related)
                        })
                        .catch(err => console.warn('[Watch] Failed to load related videos', err))
                        .finally(() => setLoadingRelated(false))
                }

                // Record to watch history
                const user = authApi.getCurrentUser()
                if (user && info) {
                    console.log('[Watch] Saving history...')
                    historyApi.add({
                        user_id: user.id || 1,
                        video_id: videoId,
                        title: info.title,
                        thumbnail: info.thumbnail,
                        progress_seconds: 0
                    }).then(() => console.log('[Watch] History saved'))
                        .catch(err => console.log('[Watch] History save failed:', err))
                }
            } catch (err) {
                console.error('[Watch] Failed to fetch video:', err)
                setError('無法載入影片，請確認連結是否正確')
            } finally {
                setLoading(false)
            }
        }

        fetchVideo()
    }, [videoId])

    // Stabilize the iframe URL to prevent unnecessary reloads during UI re-renders
    const embedSrc = useMemo(() => {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1`
    }, [videoId])

    // Reset player mode when video changes
    useEffect(() => {
        setUseEmbed(true)
    }, [videoId])

    // Auto-play next logic
    const handleVideoEnd = useCallback(() => {
        console.log('[Watch] Video ended. Checking auto-play...')

        // Priority 1: Playlist
        if (playlistItems.length > 0) {
            let nextIndex
            if (isShuffle) {
                // Find current in shuffled list
                const currentShufflePos = shuffledIndices.findIndex(idx =>
                    playlistItems[idx]?.video_id === videoId
                )
                if (currentShufflePos !== -1 && currentShufflePos < shuffledIndices.length - 1) {
                    nextIndex = shuffledIndices[currentShufflePos + 1]
                } else {
                    nextIndex = shuffledIndices[0]
                }
            } else {
                // Sequential
                const currentPos = playlistItems.findIndex(item => item.video_id === videoId)
                if (currentPos !== -1 && currentPos < playlistItems.length - 1) {
                    nextIndex = currentPos + 1
                } else {
                    nextIndex = 0
                }
            }

            if (nextIndex !== undefined && playlistItems[nextIndex]) {
                console.log('[Watch] Auto-playing NEXT in playlist:', nextIndex)
                navigate(`/watch/${playlistItems[nextIndex].video_id}?list=${playlistId}&index=${nextIndex}`)
                return
            }
        }

        // Priority 2: Related Videos (if no playlist)
        if (!playlistId && relatedVideos.length > 0) {
            console.log('[Watch] Auto-playing RELATED video:', relatedVideos[0].title)
            navigate(`/watch/${relatedVideos[0].id}`)
            return
        }

        console.log('[Watch] No next video to play.')
        console.log('[Watch] No next video to play.')
    }, [playlistItems, videoId, playlistId, isShuffle, shuffledIndices, relatedVideos, navigate])

    // Auto-skip on error in playlist mode
    useEffect(() => {
        if (error && playlistId && playlistItems.length > 0) {
            console.log('[Watch] Error detected in playlist. Auto-skipping in 2s...')
            const timer = setTimeout(() => {
                handleVideoEnd()
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [error, playlistId, playlistItems, handleVideoEnd])

    // Update document title
    useEffect(() => {
        if (videoInfo?.title) {
            document.title = `${videoInfo.title} - YT Alt`
        }
        return () => {
            document.title = 'YouTube Alternative - 無廣告播放'
        }
    }, [videoInfo?.title])

    if (loading) {
        return (
            <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
                <img src="/logo.svg" className="loading-logo" alt="Loading..." />
                <p style={{ marginTop: '16px', color: '#888', fontSize: '1rem' }}>載入影片中...</p>
                <style>{`
                    .loading-logo {
                        width: 80px;
                        height: 80px;
                        animation: breathe 2s infinite ease-in-out;
                    }
                    @keyframes breathe {
                        0% { transform: scale(1); opacity: 0.8; }
                        50% { transform: scale(1.1); opacity: 1; }
                        100% { transform: scale(1); opacity: 0.8; }
                    }
                `}</style>
            </div>
        )
    }

    if (error) {
        return (
            <div className="error-message">
                <h2>😕 播放失敗</h2>
                <p>{error}</p>
                {playlistId && (
                    <p style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
                        即將播放下一首...
                    </p>
                )}
                <p style={{ marginTop: '16px', fontSize: '0.9rem', color: '#717171' }}>
                    Video ID: {videoId}
                </p>
            </div>
        )
    }

    // Playlist loading state
    const isPlaylistLoading = playlistId && playlistItems.length === 0

    return (
        <motion.div
            className="watch-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="watch-container">
                <div className="main-content">
                    <div className="player-section">
                        <div
                            className="video-container"
                            style={{
                                aspectRatio: videoInfo?.width && videoInfo?.height
                                    ? `${videoInfo.width} / ${videoInfo.height}`
                                    : '16 / 9',
                                position: 'relative'
                            }}
                        >
                            {useEmbed ? (
                                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                    <YouTube
                                        videoId={videoId}
                                        opts={embedOpts}
                                        className="youtube-player-container"
                                        style={{ width: '100%', height: '100%' }}
                                        onReady={onPlayerReady}
                                        onError={onPlayerError}
                                        onStateChange={onPlayerStateChange}
                                    />

                                    {/* Smart Error Overlay - ONLY shows when YouTube fails */}
                                    {embedError && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'rgba(0,0,0,0.85)',
                                            zIndex: 50,
                                            backdropFilter: 'blur(4px)',
                                        }}>
                                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                                            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                                                此影片無法在嵌入模式播放
                                            </div>
                                            <div style={{ color: '#ccc', fontSize: '14px', marginBottom: '24px' }}>
                                                可能因版權或區域限制
                                            </div>
                                            <button
                                                onClick={() => setUseEmbed(false)}
                                                style={{
                                                    background: '#e53935',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '24px',
                                                    padding: '12px 32px',
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 4px 15px rgba(229,57,53,0.5)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                }}
                                            >
                                                🔄 切換播放器
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <VideoPlayer
                                        videoInfo={videoInfo}
                                        audioUrl={audioUrl}
                                        onEnded={handleVideoEnd}
                                    />
                                    {/* Floating YouTube fallback link when in proxy mode */}
                                    <a
                                        href={`https://www.youtube.com/watch?v=${videoId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            position: 'absolute',
                                            bottom: '50px',
                                            right: '12px',
                                            padding: '8px 14px',
                                            background: 'rgba(0,0,0,0.7)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.3)',
                                            borderRadius: '20px',
                                            fontSize: '0.8rem',
                                            textDecoration: 'none',
                                            zIndex: 10,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            backdropFilter: 'blur(8px)'
                                        }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                            <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                                        </svg>
                                        YouTube
                                    </a>
                                </>
                            )}
                        </div>

                        <div className="video-details">
                            <h1>{videoInfo?.title}</h1>

                            <div className="video-actions">
                                {/* Switch Button */}
                                <button
                                    className="action-button"
                                    onClick={() => setUseEmbed(!useEmbed)}
                                    title={useEmbed ? "切換至無廣告模式 (Proxy)" : "切換至穩定模式 (Embed)"}
                                    style={{
                                        background: useEmbed ? '#333' : 'var(--accent-color)',
                                        color: '#fff',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {useEmbed ? '🌐 切換播放器' : '📺 切換回 YouTube'}
                                </button>

                                {playlistId && (
                                    <button
                                        className={`action-button ${isShuffle ? 'active' : ''}`}
                                        onClick={() => setIsShuffle(!isShuffle)}
                                        style={{ background: isShuffle ? '#fff' : 'var(--bg-secondary)', color: isShuffle ? '#000' : 'inherit' }}
                                    >
                                        🔀 隨機播放
                                    </button>
                                )}
                                <span className="action-button">
                                    👁️ {formatViews(videoInfo?.view_count)}
                                </span>
                                {videoInfo?.published_at && (
                                    <span className="action-button">
                                        📅 {formatTimeAgo(videoInfo.published_at)}
                                    </span>
                                )}
                                <button className="action-button" onClick={() => {
                                    navigator.clipboard.writeText(window.location.href)
                                    alert('連結已複製!')
                                }}>
                                    📋 分享
                                </button>
                                <button className="action-button" onClick={() => setShowPlaylistModal(true)}>
                                    ➕ 加入播放清單
                                </button>
                            </div>

                            <div className="video-description">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <div className="author-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {videoInfo?.author_thumbnail && (
                                            <img
                                                src={videoInfo.author_thumbnail}
                                                alt={videoInfo.author}
                                                style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                                            />
                                        )}
                                        <div>
                                            <p className="author-name" style={{ margin: 0, fontSize: '1rem' }}>
                                                {videoInfo?.author}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        className={`subscribe-btn ${isSubscribed ? 'subscribed' : ''}`}
                                        onClick={handleSubscribe}
                                    >
                                        {isSubscribed ? '已訂閱' : '訂閱'}
                                    </button>

                                    {isSubscribed && (
                                        <button
                                            onClick={handleToggleNotify}
                                            title={notifyEnabled ? "關閉通知" : "開啟通知"}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                marginLeft: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                color: notifyEnabled ? 'var(--accent-color)' : 'var(--text-secondary)'
                                            }}
                                        >
                                            {notifyEnabled ? (
                                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                                    <path d="M7.58 4.08L6.15 2.65C3.75 4.48 2.17 7.3 2.03 10.5h2c.15-2.65 1.51-4.97 3.55-6.42zm12.39 6.42h2c-.15-3.2-1.73-6.02-4.12-7.85l-1.42 1.43c2.02 1.45 3.39 3.77 3.54 6.42zM18 11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2v-5zm-6 11c.14 0 .27-.01.4-.04.65-.14 1.18-.58 1.44-1.18.1-.24.16-.49.16-.78h-4c0 1.1.9 2 2 2z" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                                                </svg>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <p className="description-text">
                                    {videoInfo?.description || '沒有說明'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sidebar">
                    {playlistId ? (
                        <div className="playlist-panel">
                            <h3>從播放清單播放中: {playlistTitle || '載入中...'}</h3>
                            {playlistError ? (
                                <div className="error-message" style={{ padding: '20px', color: 'red', textAlign: 'center' }}>
                                    播放清單載入失敗: {playlistError}<br />
                                    <small>ID: {playlistId}</small>
                                </div>
                            ) : isPlaylistLoading ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>
                                    載入播放清單中... (ID: {playlistId})
                                </div>
                            ) : (
                                <>
                                    <div style={{ padding: '0 16px 8px', fontSize: '0.8rem', color: '#aaa' }}>
                                        {playlistItems.findIndex(i => i.video_id === videoId) + 1} / {playlistItems.length}
                                    </div>
                                    <div className="playlist-items-scroll">
                                        {playlistItems.map((item, idx) => (
                                            <div
                                                key={item.id || idx}
                                                className={`playlist-item ${item.video_id === videoId ? 'current' : ''}`}
                                                onClick={() => navigate(`/watch/${item.video_id}?list=${playlistId}&index=${idx}`)}
                                            >
                                                <span className="index">{idx + 1}</span>
                                                <img src={item.thumbnail} alt="" />
                                                <div className="info">
                                                    <div className="title">{item.title}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="related-videos">
                            {loadingRelated ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa' }}>
                                    <div className="loading-spinner" style={{
                                        margin: '0 auto 12px',
                                        width: '24px',
                                        height: '24px',
                                        border: '2px solid rgba(255,255,255,0.2)',
                                        borderTopColor: '#fff',
                                        borderRadius: '50%',
                                        animation: 'spin 0.8s linear infinite'
                                    }}></div>
                                    載入相關影片...
                                </div>
                            ) : relatedVideos.length > 0 ? (
                                relatedVideos.map(video => (
                                    <VideoCard key={video.id} video={video} type="horizontal" />
                                ))
                            ) : (
                                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                                    無相關影片
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .watch-page {
                    width: 100%;
                    max-width: 100%;
                    overflow-x: hidden;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .watch-container {
                     display: flex;
                     flex-wrap: wrap;
                     gap: 24px;
                     padding: 24px;
                     max-width: 1600px;
                     margin: 0 auto;
                }

                .main-content {
                    flex: 1;
                    min-width: 0; /* Allow shrinking */
                }

                .sidebar {
                    width: 400px;
                    flex-shrink: 0;
                }

                .video-container {
                    width: 100%;
                    background: #000;
                    border-radius: 12px;
                    overflow: hidden;
                    max-height: 80vh;
                }
                
                .video-details {
                    padding: 16px 0;
                }
                
                .video-details h1 {
                    font-size: 1.3rem;
                    font-weight: 600;
                    line-height: 1.4;
                    margin-bottom: 12px;
                    word-wrap: break-word;
                }
                
                .video-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-bottom: 16px;
                }
                
                .action-button {
                    padding: 8px 16px;
                    background: var(--bg-secondary);
                    border-radius: 20px;
                    font-size: 0.9rem;
                    white-space: nowrap;
                    cursor: pointer;
                    border: none;
                    color: white;
                }

                .playlist-panel {
                    border: 1px solid #333;
                    border-radius: 12px;
                    background: #1e1e1e;
                    overflow: hidden;
                    margin-bottom: 16px;
                }

                .playlist-panel h3 {
                    padding: 12px 16px;
                    font-size: 0.9rem;
                    background: #2a2a2a;
                    margin: 0;
                }

                .playlist-items-scroll {
                    max-height: 400px; /* Taller on side */
                    overflow-y: auto;
                }

                .playlist-item {
                    display: flex;
                    align-items: center;
                    padding: 8px 12px;
                    gap: 10px;
                    cursor: pointer;
                }

                .playlist-item:hover {
                    background: #333;
                }

                .playlist-item.current {
                    background: #3a3a3a;
                }

                .playlist-item .index {
                    color: #aaa;
                    font-size: 0.8rem;
                    min-width: 20px;
                }

                .playlist-item img {
                    width: 100px;
                    height: 56px;
                    object-fit: cover;
                    border-radius: 4px;
                }

                .playlist-item .info {
                     flex: 1;
                     overflow: hidden;
                }
                
                .playlist-item .title {
                    font-size: 0.85rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .video-description {
                    padding: 14px;
                    background: var(--bg-secondary);
                    border-radius: 12px;
                }
                
                .author-name {
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                
                .description-text {
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }
                
                .subscribe-btn {
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-weight: bold;
                    cursor: pointer;
                    border: none;
                    background: #fff;
                    color: #000;
                    margin-left: auto;
                    font-size: 0.9rem;
                    transition: background 0.2s;
                }
                .subscribe-btn:hover {
                    background: #e6e6e6;
                }
                .subscribe-btn.subscribed {
                    background: #333;
                    color: #fff;
                    border: 1px solid #555;
                }
                .subscribe-btn.subscribed:hover {
                    background: #444;
                }

                @media (max-width: 1024px) {
                    .watch-container {
                        flex-direction: column;
                        padding: 0;
                        gap: 0;
                    }

                    .main-content {
                        width: 100%;
                    }

                    .sidebar {
                        width: 100%;
                        padding: 0 16px;
                    }
                    
                    .video-container {
                        border-radius: 0;
                        margin-bottom: 0;
                    }
                    
                     .video-details {
                        padding: 12px 16px;
                    }
                }
            `}</style>

            <AddToPlaylistModal
                isOpen={showPlaylistModal}
                onClose={() => setShowPlaylistModal(false)}
                videoInfo={videoInfo}
            />
        </motion.div >
    )
}

function formatViews(count) {
    if (!count) return '0 次觀看'
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M 次觀看`
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K 次觀看`
    }
    return `${count} 次觀看`
}

export default Watch
