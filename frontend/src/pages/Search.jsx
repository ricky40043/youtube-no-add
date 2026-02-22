import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'
import { searchApi } from '../services/api'
import { updateSearchHistoryThumbnail } from '../utils/searchHistory'

function Search() {
    const [searchParams] = useSearchParams()
    const query = searchParams.get('q') || ''
    const [videos, setVideos] = useState([])
    const [relatedVideos, setRelatedVideos] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [hasMore, setHasMore] = useState(true)
    
    // Related videos pagination
    const [relatedOffset, setRelatedOffset] = useState(0)
    const [hasMoreRelated, setHasMoreRelated] = useState(true)
    const [loadingRelated, setLoadingRelated] = useState(false)

    // Refs for stable infinite scroll
    const offsetRef = useRef(0)
    const hasMoreRef = useRef(true)
    const isLoadingRef = useRef(false)
    const observerRef = useRef(null)
    const sentinelRef = useRef(null)
    const queryRef = useRef(query)
    const relatedQueryRef = useRef(query)

    // Keep query ref updated
    useEffect(() => {
        queryRef.current = query
        relatedQueryRef.current = query
    }, [query])

    // Function to load more related videos
    const loadMoreRelated = useCallback(async () => {
        console.log('[Search] loadMoreRelated CLICKED, offset:', relatedOffset)
        if (loadingRelated) return
        
        setLoadingRelated(true)
        try {
            const newRelated = await searchApi.getRelated(relatedQueryRef.current, 10, relatedOffset)
            console.log('[Search] loadMoreRelated got:', newRelated.length)
            if (newRelated.length === 0) {
                setHasMoreRelated(false)
            } else {
                setRelatedVideos(prev => [...prev, ...newRelated])
                setRelatedOffset(prev => prev + 10)
            }
        } catch (err) {
            console.error('[Search] loadMoreRelated error:', err)
        } finally {
            setLoadingRelated(false)
        }
    }, [relatedOffset])

    // Stable loadMore function
    const loadMore = useCallback(async () => {
        if (isLoadingRef.current || !hasMoreRef.current || !queryRef.current.trim()) return

        isLoadingRef.current = true
        setLoading(true)

        try {
            // Load more results (unlimited)
            const newResults = await searchApi.search(queryRef.current, 30, offsetRef.current)

            if (newResults.length === 0) {
                hasMoreRef.current = false
                setHasMore(false)
            } else {
                setVideos(prev => {
                    const existingIds = new Set(prev.map(v => v.id))
                    const uniqueNew = newResults.filter(v => !existingIds.has(v.id))
                    return [...prev, ...uniqueNew]
                })
                offsetRef.current += 30
                if (newResults.length < 30) {
                    hasMoreRef.current = false
                    setHasMore(false)
                }
            }
        } catch (err) {
            console.error('Load more failed', err)
        } finally {
            isLoadingRef.current = false
            setLoading(false)
        }
    }, [])

    // Initial Search
    useEffect(() => {
        window.scrollTo(0, 0)
        setVideos([])
        setRelatedVideos([])
        offsetRef.current = 0
        hasMoreRef.current = true
        setHasMore(true)
        // Reset related videos state
        setRelatedOffset(0)
        setHasMoreRelated(true)
        if (!query.trim()) return

        const fetchInitial = async () => {
            try {
                setLoading(true)
                setError(null)
                // Initial search: limited results for speed
                const results = await searchApi.search(query, 10, 0)
                setVideos(results)
                offsetRef.current = 10
                if (results.length < 10) {
                    hasMoreRef.current = false
                    setHasMore(false)
                }

                if (results.length > 0 && results[0].thumbnail) {
                    updateSearchHistoryThumbnail(query, results[0].thumbnail)
                }

                // Fetch related recommendations
                try {
                    const related = await searchApi.getRelated(query, 10)
                    setRelatedVideos(related || [])
                    setHasMoreRelated((related || []).length >= 10)
                } catch (relErr) {
                    console.error('Failed to fetch related:', relErr)
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

    // Stable Observer for infinite scroll
    useEffect(() => {
        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !isLoadingRef.current && hasMoreRef.current) {
                loadMore()
            }
        }, { rootMargin: '400px', threshold: 0 })

        return () => observerRef.current?.disconnect()
    }, [loadMore])

    // Observe sentinel when videos change
    useEffect(() => {
        const sentinel = sentinelRef.current || document.getElementById('scroll-sentinel')
        if (sentinel && observerRef.current) {
            observerRef.current.observe(sentinel)
            return () => observerRef.current?.unobserve(sentinel)
        }
    }, [videos.length])

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

            {/* Related Recommendations Section */}
            {relatedVideos.length > 0 && (
                <div className="related-section">
                    <h3 className="related-title">── 你可能也有興趣 ──</h3>
                    <div className="video-grid">
                        {relatedVideos.map((video) => (
                            <VideoCard key={`related-${video.id}`} video={video} />
                        ))}
                    </div>
                    
                    {/* Load More Related Videos Button - only show when has more */}
                    {relatedVideos.length > 0 && hasMoreRelated && !loadingRelated && (
                        <button 
                            onClick={() => loadMoreRelated()}
                            style={{ 
                                display: 'block', 
                                margin: '20px auto', 
                                padding: '10px 20px',
                                background: 'var(--accent)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '20px',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            換一批 / 載入更多
                        </button>
                    )}
                </div>
            )}

            {/* Load More Sentinel / Spinner */}
            {videos.length > 0 && hasMore && (
                <div ref={sentinelRef} id="scroll-sentinel" style={{ padding: '20px', textAlign: 'center', minHeight: '50px' }}>
                    {loading && videos.length > 0 && (
                        <div className="loading-container small">
                            <img src="/logo.svg" className="loading-logo small" alt="Loading..." />
                        </div>
                    )}
                </div>
            )}

            {/* Manual Load More Button for Search Results - only show when has more */}
            {videos.length > 0 && hasMore && !loading && (
                <button 
                    onClick={() => loadMore()}
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

            <style>{`
                .related-section {
                    margin-top: 32px;
                    padding-top: 24px;
                    border-top: 1px solid var(--border);
                }
                .related-title {
                    text-align: center;
                    color: var(--text-secondary);
                    font-size: 0.95rem;
                    margin-bottom: 20px;
                    font-weight: normal;
                }
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
