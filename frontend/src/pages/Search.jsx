import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi } from '../services/api'

function Search() {
    const [searchParams] = useSearchParams()
    const query = searchParams.get('q') || ''
    const [videos, setVideos] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchResults = async () => {
            if (!query.trim()) {
                setVideos([])
                setLoading(false)
                return
            }

            try {
                setLoading(true)
                setError(null)
                const results = await searchApi.search(query)
                setVideos(results)
            } catch (err) {
                console.error('Search failed:', err)
                setError('搜尋失敗，請稍後再試')
            } finally {
                setLoading(false)
            }
        }

        fetchResults()
    }, [query])

    // Update document title
    useEffect(() => {
        document.title = query ? `${query} - 搜尋結果` : 'YouTube Alternative'
        return () => {
            document.title = 'YouTube Alternative - 無廣告播放'
        }
    }, [query])

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="error-message">
                <h2>😕 搜尋失敗</h2>
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
            <h1 style={{ marginBottom: '24px', fontSize: '1.25rem' }}>
                搜尋結果：{query}
                <span style={{
                    marginLeft: '12px',
                    fontSize: '0.9rem',
                    color: 'var(--text-muted)'
                }}>
                    共 {videos.length} 個結果
                </span>
            </h1>

            {videos.length > 0 ? (
                <div className="video-grid">
                    {videos.map((video, index) => (
                        <VideoCard key={video.id || index} video={video} />
                    ))}
                </div>
            ) : (
                <div className="error-message">
                    <p>找不到符合「{query}」的影片</p>
                </div>
            )}
        </motion.div>
    )
}

export default Search
