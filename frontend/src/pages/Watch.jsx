import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import VideoPlayer from '../components/VideoPlayer'
import AddToPlaylistModal from '../components/AddToPlaylistModal'
import { videoApi, historyApi, authApi } from '../services/api'

function Watch() {
    const { videoId } = useParams()
    const [videoInfo, setVideoInfo] = useState(null)
    const [audioUrl, setAudioUrl] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showPlaylistModal, setShowPlaylistModal] = useState(false)

    useEffect(() => {
        const fetchVideo = async () => {
            if (!videoId) return

            try {
                setLoading(true)
                setError(null)

                // Fetch video info
                const info = await videoApi.getInfo(videoId)
                setVideoInfo(info)

                // Also get audio URL for background playback fallback
                try {
                    const audio = await videoApi.getAudioUrl(videoId)
                    setAudioUrl(audio)
                } catch {
                    // Audio URL is optional
                }

                // Record to watch history if user is logged in
                const user = authApi.getCurrentUser()
                if (user && info) {
                    try {
                        await historyApi.add({
                            user_id: user.id || 1,
                            video_id: videoId,
                            title: info.title,
                            thumbnail: info.thumbnail,
                            progress_seconds: 0
                        })
                    } catch (err) {
                        console.log('History recording failed (non-critical):', err)
                    }
                }
            } catch (err) {
                console.error('Failed to fetch video:', err)
                setError('無法載入影片，請確認連結是否正確')
            } finally {
                setLoading(false)
            }
        }

        fetchVideo()
    }, [videoId])

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
            <div className="loading">
                <div className="spinner" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="error-message">
                <h2>😕 播放失敗</h2>
                <p>{error}</p>
                <p style={{ marginTop: '16px', fontSize: '0.9rem', color: '#717171' }}>
                    Video ID: {videoId}
                </p>
            </div>
        )
    }

    return (
        <motion.div
            className="watch-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="player-section">
                <div
                    className="video-container"
                    style={{
                        aspectRatio: videoInfo?.width && videoInfo?.height
                            ? `${videoInfo.width} / ${videoInfo.height}`
                            : '16 / 9'
                    }}
                >
                    <VideoPlayer
                        videoInfo={videoInfo}
                        audioUrl={audioUrl}
                    />
                </div>

                <div className="video-details">
                    <h1>{videoInfo?.title}</h1>

                    <div className="video-actions">
                        <span className="action-button">
                            👁️ {formatViews(videoInfo?.view_count)}
                        </span>
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
                        <p className="author-name">
                            {videoInfo?.author}
                        </p>
                        <p className="description-text">
                            {videoInfo?.description || '沒有說明'}
                        </p>
                    </div>
                </div>
            </div>

            <style>{`
                .watch-page {
                    width: 100%;
                    max-width: 100%;
                    overflow-x: hidden;
                }
                
                .player-section {
                    width: 100%;
                    max-width: 100%;
                }
                
                .video-container {
                    width: 100%;
                    /* aspect-ratio set via inline style */
                    background: #000;
                    border-radius: 12px;
                    overflow: hidden;
                    max-height: 80vh; /* Prevent vertical videos from taking too much space */
                }
                
                .video-details {
                    padding: 16px 4px;
                }
                
                .video-details h1 {
                    font-size: 1.1rem;
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
                
                @media (min-width: 768px) {
                    .video-details h1 {
                        font-size: 1.3rem;
                    }
                    
                    .video-details {
                        padding: 16px 0;
                    }
                }

                @media (max-width: 767px) {
                    /* Mobile-specific overrides for native app feel */
                    .watch-page {
                        padding: 0 !important; /* Remove global padding */
                        margin-left: -16px !important; /* Compensate for main-content padding */
                        width: 100vw;
                        max-width: 100vw;
                    }

                    .player-section {
                        width: 100vw;
                        margin: 0;
                    }

                    .video-container {
                        border-radius: 0 !important; /* No rounded corners on mobile */
                        width: 100vw;
                        max-height: none; /* Let aspect ratio dictate height */
                    }

                    .video-details {
                        padding: 12px 16px; /* Add padding back for text content */
                    }

                    .video-actions {
                        padding: 0 16px 16px 16px;
                    }
                }
            `}</style>

            <AddToPlaylistModal
                isOpen={showPlaylistModal}
                onClose={() => setShowPlaylistModal(false)}
                videoInfo={videoInfo}
            />
        </motion.div>
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
