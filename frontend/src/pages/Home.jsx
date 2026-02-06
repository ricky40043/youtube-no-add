import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi, subscriptionApi, authApi } from '../services/api'

function Home() {
    const [videos, setVideos] = useState([])
    const [subFeed, setSubFeed] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [user] = useState(authApi.getCurrentUser())

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                setLoading(true)

                // Fetch subscription feed if logged in
                if (user) {
                    subscriptionApi.getFeed()
                        .then(feed => {
                            console.log('Feed loaded:', feed.length)
                            setSubFeed(feed)
                        })
                        .catch(err => console.error('Failed to load feed:', err))
                }

                const results = await searchApi.getTrending('TW')
                setVideos(results)
            } catch (err) {
                console.error('Failed to fetch trending:', err)
                setError('無法載入熱門影片，請稍後再試')
                // Try to search for popular content as fallback
                try {
                    const fallback = await searchApi.search('music trending', 20)
                    setVideos(fallback)
                    setError(null)
                } catch {
                    // Keep original error
                }
            } finally {
                setLoading(false)
            }
        }

        fetchTrending()
    }, [user])

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner" />
            </div>
        )
    }

    if (error && videos.length === 0) {
        return (
            <div className="error-message">
                <h2>😕 載入失敗</h2>
                <p>{error}</p>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="subscription-feed-section" style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--accent-color)' }}>
                        📰 來自您的訂閱
                    </h1>
                    <a href="/subscriptions" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.9rem' }}>
                        管理訂閱 &rarr;
                    </a>
                </div>
                <div className="video-grid">
                    {subFeed.map((video, index) => (
                        <VideoCard key={`sub-${video.id}-${index}`} video={video} />
                    ))}
                </div>
            </div>


            <h1 style={{ marginBottom: '24px', fontSize: '1.5rem' }}>
                🔥 熱門影片
            </h1>

            <div className="video-grid">
                {videos.map((video, index) => (
                    <VideoCard key={video.id || index} video={video} />
                ))}
            </div>

            {videos.length === 0 && !loading && (
                <div className="error-message">
                    <p>搜尋影片或貼上 YouTube 連結開始觀看</p>
                </div>
            )}
        </motion.div>
    )
}

export default Home
