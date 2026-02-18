import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi } from '../services/api'
import { updateSearchHistoryThumbnail } from '../utils/searchHistory'

function Search() {
    const [searchParams] = useSearchParams()
    const query = searchParams.get('q') || ''
    const [videos, setVideos] = useState([])
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState(null)
    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(true)

    // Initial Search
    useEffect(() => {
        setVideos([])
        setOffset(0)
        setHasMore(true)
        if (!query.trim()) return

        const fetchInitial = async () => {
            try {
                setLoading(true)
                setError(null)
                // Use default limit 20
                const results = await searchApi.search(query, 20)
                setVideos(results)
                setOffset(20)
                if (results.length < 20) setHasMore(false)

                // Save first result thumbnail to search history
                if (results.length > 0 && results[0].thumbnail) {
                    updateSearchHistoryThumbnail(query, results[0].thumbnail)
                }
            } catch (err) {
                console.error('Search failed:', err)
                setError('搜尋失敗，請稍後再試')
            } finally {
                setLoading(false)
            }
        }
        fetchInitial()
    }, [query])

    // Update document title
    useEffect(() => {
        document.title = query ? `${query} - 搜尋結果` : 'YouTube Alternative'
        return () => {
            document.title = 'YouTube Alternative - 無廣告播放'
        }
    }, [query])

    // Load More
    const loadMore = async () => {
        if (loadingMore || !hasMore || !query.trim()) return

        try {
            setLoadingMore(true)
            // Call API with offset
            // Note: searchApi.search needs update to accept offset, or we pass it via options
            // services/api.js searchApi.search currently takes (query, maxResults)
            // We need to update api.js or use manual axios call. 
            // Let's assume we will update api.js in next step, or pass it as 3rd arg if supported.
            // Wait, I haven't updated api.js yet! I need to update api.js to support offset.
            // For now I'll use a hack or assume I'll update api.js immediately after.
            // I'll update api.js to support offset.
            const newResults = await searchApi.search(query, 20, offset)

            if (newResults.length === 0) {
                setHasMore(false)
            } else {
                setVideos(prev => {
                    const existingIds = new Set(prev.map(v => v.id))
                    const uniqueNew = newResults.filter(v => !existingIds.has(v.id))
                    return [...prev, ...uniqueNew]
                })
                setOffset(prev => prev + 20)
                if (newResults.length < 20) setHasMore(false)
            }
        } catch (err) {
            console.error('Load more failed', err)
        } finally {
            setLoadingMore(false)
        }
    }

    // Intersection Observer for Infinite Scroll
    useEffect(() => {
        if (loading || !hasMore) return

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                loadMore()
            }
        }, { threshold: 0.5 })

        const sentinel = document.getElementById('scroll-sentinel')
        if (sentinel) observer.observe(sentinel)

        return () => observer.disconnect()
    }, [loading, hasMore, offset, videos.length]) // Add dependencies

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ paddingBottom: '40px' }}
        >
            {/* <h1 style={{ marginBottom: '24px', fontSize: '1.25rem' }}>
                搜尋結果：{query}
            </h1> */}

            {/* Initial Loading */}
            {loading && videos.length === 0 && (
                <div className="loading-container">
                    <img src="/logo.svg" className="loading-logo" alt="Loading..." />
                    <p style={{ marginTop: '16px', color: '#888' }}>搜尋中...</p>
                </div>
            )}

            {error && (
                <div className="error-message">
                    <h2>😕 搜尋失敗</h2>
                    <p>{error}</p>
                </div>
            )}

            {!loading && videos.length === 0 && !error && (
                <div className="error-message">
                    <p>找不到符合「{query}」的影片</p>
                </div>
            )}

            <div className="video-grid">
                {videos.map((video, index) => (
                    <VideoCard key={`${video.id}-${index}`} video={video} />
                ))}
            </div>

            {/* Load More Sentinel / Spinner */}
            {videos.length > 0 && hasMore && (
                <div id="scroll-sentinel" style={{ padding: '20px', textAlign: 'center', minHeight: '50px' }}>
                    {loadingMore && (
                        <div className="loading-container small">
                            <img src="/logo.svg" className="loading-logo small" alt="Loading..." />
                        </div>
                    )}
                </div>
            )}

            <style>{`
                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    margin: 40px 0;
                }
                .loading-logo {
                    width: 60px; 
                    height: 60px;
                    animation: breathe 2s infinite ease-in-out;
                }
                .loading-logo.small {
                    width: 30px;
                    height: 30px;
                }
                @keyframes breathe {
                    0% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(1); opacity: 0.8; }
                }
            `}</style>
        </motion.div>
    )
}

export default Search
