import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi } from '../services/api'

function Home() {
    const [videos, setVideos] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                setLoading(true)
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
    }, [])

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
