import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi, feedApi, authApi, subscriptionApi } from '../services/api'

function Home() {
    const [videos, setVideos] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [user] = useState(authApi.getCurrentUser())

    // 'recommended' | 'subscriptions' | 'trending' | 'notifications'
    const [activeTab, setActiveTab] = useState(user ? 'recommended' : 'trending')
    const [syncing, setSyncing] = useState(false)
    const [hasMore, setHasMore] = useState(true)

    // Refs for stable infinite scroll (avoid stale closure)
    const cursorRef = useRef(null)
    const hasMoreRef = useRef(true)
    const isLoadingRef = useRef(false)
    const observerRef = useRef(null)
    const sentinelRef = useRef(null)
    const fetchFeedRef = useRef(null)

    // Stable fetchFeed with useCallback
    const fetchFeed = useCallback(async (init = false) => {
        console.log('[Home] fetchFeed CLICKED, init:', init, 'cursor:', cursorRef.current)
        if (isLoadingRef.current) {
            console.log('[Home] Already loading, skip')
            return
        }
        
        isLoadingRef.current = true
        setLoading(true)
        setError(null)

        try {
            const currentCursor = init ? null : cursorRef.current
            console.log('[Home] Calling API with cursor:', currentCursor)
            
            const data = await feedApi.getFeed(currentCursor)
            console.log('[Home] API returned:', data.items?.length, 'items, cursor:', data.next_cursor)

            if (init) {
                setVideos(data.items || [])
            } else {
                setVideos(prev => [...prev, ...(data.items || [])])
            }

            // Check if there are more items to load
            const hasItems = data.items && data.items.length > 0
            const nextPage = data.next_cursor || (hasItems ? String((parseInt(cursorRef.current) || 0) + 1) : null)
            cursorRef.current = nextPage
            hasMoreRef.current = hasItems && !!data.next_cursor
            setHasMore(hasItems && !!data.next_cursor)
            console.log('[Home] Set next cursor to:', nextPage)
        } catch (err) {
            console.error('[Home] Error:', err)
            setError('無法載入更多推薦，請稍後再試')
        } finally {
            isLoadingRef.current = false
            setLoading(false)
        }
    }, [])

    // Fetch Trending
    const fetchTrending = useCallback(async () => {
        isLoadingRef.current = true
        setLoading(true)
        setError(null)
        try {
            const results = await searchApi.getTrending('TW')
            setVideos(results)
            hasMoreRef.current = false
            setHasMore(false)
        } catch (err) {
            console.error('Failed to fetch trending:', err)
            setError('無法載入熱門影片')
        } finally {
            isLoadingRef.current = false
            setLoading(false)
        }
    }, [])

    // Fetch Subscriptions feed (latest videos from all subscribed channels)
    const fetchSubscriptions = useCallback(async () => {
        isLoadingRef.current = true
        setLoading(true)
        setError(null)
        try {
            const data = await subscriptionApi.getFeed()
            setVideos(data)
            hasMoreRef.current = false
            setHasMore(false)
        } catch (err) {
            console.error("Failed to fetch subscriptions feed:", err)
            setError("無法載入訂閱內容")
        } finally {
            isLoadingRef.current = false
            setLoading(false)
        }
    }, [])

    // Fetch Notifications
    const fetchNotifications = useCallback(async () => {
        isLoadingRef.current = true
        setLoading(true)
        setError(null)
        try {
            const data = await subscriptionApi.getNotifications()
            setVideos(data)
            hasMoreRef.current = false
            setHasMore(false)
        } catch (err) {
            console.error("Failed to fetch notifications:", err)
            setError("無法載入通知")
        } finally {
            isLoadingRef.current = false
            setLoading(false)
        }
    }, [])

    // Initial load when tab changes
    useEffect(() => {
        window.scrollTo(0, 0)
        setVideos([])
        cursorRef.current = null
        hasMoreRef.current = true
        setHasMore(true)

        if (activeTab === 'recommended' && user) {
            fetchFeed(true)
        } else if (activeTab === 'subscriptions' && user) {
            fetchSubscriptions()
        } else if (activeTab === 'notifications' && user) {
            fetchNotifications()
        } else {
            fetchTrending()
        }
    }, [activeTab, user, fetchFeed, fetchSubscriptions, fetchNotifications, fetchTrending])

    // Listen for notification changes globally
    useEffect(() => {
        const handleNotifyChange = () => {
            if (activeTab === 'notifications' && user) {
                fetchNotifications()
            }
        }
        window.addEventListener('notification-change', handleNotifyChange)
        return () => window.removeEventListener('notification-change', handleNotifyChange)
    }, [activeTab, user, fetchNotifications])

    // Auto-sync on mount
    useEffect(() => {
        if (user && activeTab === 'recommended') {
            const autoSync = async () => {
                try {
                    setSyncing(true)
                    await feedApi.sync()
                    setTimeout(() => {
                        if (activeTab === 'recommended') fetchFeed(false)
                    }, 1000)
                } catch (e) {
                    console.error("Auto sync failed:", e)
                } finally {
                    setSyncing(false)
                }
            }
            autoSync()
        }
    }, [user, activeTab, fetchFeed])

    // Stable Observer for infinite scroll (sentinel-based)
    useEffect(() => {
        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !isLoadingRef.current && hasMoreRef.current) {
                if (activeTab === 'recommended') {
                    fetchFeed(false)
                }
            }
        }, { rootMargin: '400px', threshold: 0 })

        return () => observerRef.current?.disconnect()
    }, [activeTab, fetchFeed])

    // Observe sentinel when videos change
    useEffect(() => {
        const sentinel = sentinelRef.current
        if (sentinel && observerRef.current) {
            observerRef.current.observe(sentinel)
            return () => observerRef.current?.unobserve(sentinel)
        }
    }, [videos.length])

    // ... (rest is same until render)

    const handleSync = async () => {
        // ... (can keep function or remove if unused, but removing button is key)
    }

    const handleRetry = () => {
        if (activeTab === 'recommended') fetchFeed(true)
        else if (activeTab === 'subscriptions') fetchSubscriptions()
        else if (activeTab === 'trending') fetchTrending()
        else fetchNotifications()
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}
        >
            {/* Tabs Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                marginBottom: '24px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '16px'
            }}>
                {user && (
                    <button
                        onClick={() => setActiveTab('recommended')}
                        style={{
                            fontSize: '1.2rem',
                            fontWeight: activeTab === 'recommended' ? 'bold' : 'normal',
                            color: activeTab === 'recommended' ? 'var(--accent)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'recommended' ? '2px solid var(--accent)' : 'none',
                            paddingBottom: '4px'
                        }}
                    >
                        {user ? '✨ 為您推薦' : '✨ 登入以獲推薦'}
                    </button>
                )}

                {user && (
                    <button
                        onClick={() => setActiveTab('subscriptions')}
                        style={{
                            fontSize: '1.2rem',
                            fontWeight: activeTab === 'subscriptions' ? 'bold' : 'normal',
                            color: activeTab === 'subscriptions' ? 'var(--accent)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'subscriptions' ? '2px solid var(--accent)' : 'none',
                            paddingBottom: '4px'
                        }}
                    >
                        📺 訂閱內容
                    </button>
                )}

                <button
                    onClick={() => setActiveTab('trending')}
                    style={{
                        fontSize: '1.2rem',
                        fontWeight: activeTab === 'trending' ? 'bold' : 'normal',
                        color: activeTab === 'trending' ? 'var(--accent)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'trending' ? '2px solid var(--accent)' : 'none',
                        paddingBottom: '4px'
                    }}
                >
                    🔥 熱門發燒
                </button>

                {user && (
                    <button
                        onClick={() => setActiveTab('notifications')}
                        style={{
                            fontSize: '1.2rem',
                            fontWeight: activeTab === 'notifications' ? 'bold' : 'normal',
                            color: activeTab === 'notifications' ? 'var(--accent)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'notifications' ? '2px solid var(--accent)' : 'none',
                            paddingBottom: '4px'
                        }}
                    >
                        🔔 最新通知
                    </button>
                )}

                <div style={{ flex: 1 }}></div>

                {/* Sync Button Removed (Auto Sync Enabled) */}
            </div>

            {error && videos.length === 0 ? (
                <div className="error-message">
                    <h2>😕 載入失敗</h2>
                    <p>{error}</p>
                    <button onClick={handleRetry} style={{ marginTop: '16px', textDecoration: 'underline' }}>重試</button>
                </div>
            ) : (
                <>
                    {videos.length === 0 && !loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                            {activeTab === 'recommended'
                                ? '還沒有推薦內容，試著先同步訂閱或觀看一些影片吧！'
                                : activeTab === 'subscriptions'
                                    ? '還沒有訂閱任何頻道，去訂閱一些頻道吧！'
                                    : activeTab === 'notifications'
                                        ? '過去 7 天內沒有新通知'
                                        : '沒有影片'}
                        </div>
                    ) : (
                        <div className="video-grid">
                            {videos.map((video) => (
                                <VideoCard key={video.id} video={video} />
                            ))}
                        </div>
                    )}

                    {/* Sentinel for infinite scroll */}
                    <div ref={sentinelRef} style={{ height: '20px' }} />

                    {/* Manual Load More Button - only show when has videos AND has more */}
                    {videos.length > 0 && hasMore && !loading && (
                        <button 
                            onClick={() => fetchFeed(false)}
                            style={{ 
                                display: 'block', 
                                margin: '20px auto', 
                                padding: '12px 24px',
                                background: 'var(--accent)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '24px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            載入更多
                        </button>
                    )}

                    {loading && (
                        <div className="loading" style={{ margin: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <img src="/logo.svg" className="loading-logo" alt="Loading..." style={{ width: '60px', height: '60px' }} />
                            <span style={{ color: '#666', fontSize: '1rem' }}>載入中...</span>
                        </div>
                    )}

                    {!hasMore && videos.length > 0 && activeTab === 'recommended' && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                            沒有更多推薦了
                        </div>
                    )}

                    {!hasMore && videos.length === 0 && activeTab === 'recommended' && !loading && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                            無法載入更多
                        </div>
                    )}
                </>
            )}

            <style>{`
                @keyframes breathe {
                    0% { transform: scale(0.95); opacity: 0.8; }
                    50% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0.8; }
                }
                .loading-logo {
                    animation: breathe 1.5s infinite ease-in-out;
                }
            `}</style>
        </motion.div>
    )
}

export default Home
