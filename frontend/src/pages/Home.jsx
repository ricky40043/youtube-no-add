import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi, feedApi, authApi } from '../services/api'

function Home() {
    const [videos, setVideos] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [user] = useState(authApi.getCurrentUser())

    // 'recommended' | 'trending'
    const [activeTab, setActiveTab] = useState(user ? 'recommended' : 'trending')
    const [syncing, setSyncing] = useState(false)

    // Pagination state
    const [cursor, setCursor] = useState(null)
    const [hasMore, setHasMore] = useState(true)

    // Fetch Feed (Recommended)
    const fetchFeed = async (init = false) => {
        setLoading(true)
        setError(null)
        try {
            const currentCursor = init ? null : cursor
            const data = await feedApi.getFeed(currentCursor)

            if (init) {
                setVideos(data.items || [])
            } else {
                setVideos(prev => [...prev, ...(data.items || [])])
            }

            setCursor(data.next_cursor)
            setHasMore(!!data.next_cursor)
        } catch (err) {
            console.error('Failed to fetch feed:', err)
            setError('無法載入更多推薦，請稍後再試')
        } finally {
            setLoading(false)
        }
    }

    // Fetch Trending
    const fetchTrending = async () => {
        setLoading(true)
        setError(null)
        try {
            const results = await searchApi.getTrending('TW')
            setVideos(results)
            setHasMore(false)
        } catch (err) {
            console.error('Failed to fetch trending:', err)
            setError('無法載入熱門影片')
        } finally {
            setLoading(false)
        }
    }

    // Initial load when tab changes
    useEffect(() => {
        setVideos([])
        setCursor(null)
        setHasMore(true)

        if (activeTab === 'recommended' && user) {
            fetchFeed(true)
        } else {
            fetchTrending()
        }
    }, [activeTab, user])

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
    }, [])

    // Observer for infinite scroll
    const observer = useRef()
    const lastVideoElementRef = useCallback(node => {
        if (loading) return
        if (observer.current) observer.current.disconnect()
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                if (activeTab === 'recommended') {
                    fetchFeed(false)
                }
            }
        }, {
            rootMargin: '200px',
            threshold: 0
        })
        if (node) observer.current.observe(node)
    }, [loading, hasMore, activeTab, fetchFeed])

    // ... (rest is same until render)

    const handleSync = async () => {
        // ... (can keep function or remove if unused, but removing button is key)
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
                        ✨ 為您推薦
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

                <div style={{ flex: 1 }}></div>

                {/* Sync Button Removed (Auto Sync Enabled) */}
            </div>

            {error && videos.length === 0 ? (
                <div className="error-message">
                    <h2>😕 載入失敗</h2>
                    <p>{error}</p>
                    <button onClick={() => activeTab === 'recommended' ? fetchFeed(true) : fetchTrending()} style={{ marginTop: '16px', textDecoration: 'underline' }}>重試</button>
                </div>
            ) : (
                <>
                    {videos.length === 0 && !loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                            {activeTab === 'recommended'
                                ? '還沒有推薦內容，試著先同步訂閱或觀看一些影片吧！'
                                : '沒有影片'}
                        </div>
                    ) : (
                        <div className="video-grid">
                            {videos.map((video, index) => {
                                if (videos.length === index + 1) {
                                    return (
                                        <div ref={lastVideoElementRef} key={video.id || index}>
                                            <VideoCard video={video} />
                                        </div>
                                    )
                                } else {
                                    return <VideoCard key={video.id || index} video={video} />
                                }
                            })}
                        </div>
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
