
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { subscriptionApi } from '../services/api'

function Notifications() {
    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const data = await subscriptionApi.getNotifications()
                setNotifications(data)
            } catch (err) {
                console.error("Failed to fetch notifications:", err)
                setError("無法載入通知")
            } finally {
                setLoading(false)
            }
        }

        fetchNotifications()
    }, [])

    if (loading) {
        return <div className="loading">載入中...</div>
    }

    if (error) {
        return <div className="error">{error}</div>
    }

    return (
        <div className="notifications-page">
            <h2>最新通知</h2>
            <div className="notifications-list">
                {notifications.length === 0 ? (
                    <div className="no-notifications">
                        <p>過去 24 小時內沒有新通知</p>
                    </div>
                ) : (
                    notifications.map(video => (
                        <div key={video.id} className="notification-item">
                            <Link to={`/watch/${video.id}`} className="notification-link">
                                <div className="notification-thumbnail">
                                    <img src={video.thumbnail} alt={video.title} />
                                    <span className="duration">{formatDuration(video.duration)}</span>
                                </div>
                                <div className="notification-info">
                                    <h3 className="video-title">{video.title}</h3>
                                    <div className="video-meta">
                                        <span className="channel-name">{video.author}</span>
                                        <span className="upload-time">{new Date(video.published_at).toLocaleString()}</span>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    ))
                )}
            </div>

            <style>{`
                .notifications-page {
                    padding: 20px;
                    max-width: 800px;
                    margin: 0 auto;
                    color: var(--text-primary);
                }

                h2 {
                    margin-bottom: 20px;
                    font-size: 1.5rem;
                }

                .notification-item {
                    margin-bottom: 16px;
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    overflow: hidden;
                    transition: background 0.2s;
                }

                .notification-item:hover {
                    background: var(--bg-hover);
                }

                .notification-link {
                    display: flex;
                    padding: 12px;
                    gap: 16px;
                    text-decoration: none;
                    color: inherit;
                }

                .notification-thumbnail {
                    position: relative;
                    width: 160px;
                    aspect-ratio: 16/9;
                    flex-shrink: 0;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .notification-thumbnail img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .duration {
                    position: absolute;
                    bottom: 4px;
                    right: 4px;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 2px 4px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                }

                .notification-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                .video-title {
                    margin: 0 0 8px 0;
                    font-size: 1rem;
                    line-height: 1.4;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .video-meta {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                
                .no-notifications {
                    text-align: center;
                    padding: 40px;
                    color: var(--text-secondary);
                }

                @media (max-width: 600px) {
                    .notification-link {
                         flex-direction: column;
                         gap: 8px;
                    }
                    .notification-thumbnail {
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    )
}

function formatDuration(seconds) {
    if (!seconds) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

export default Notifications
