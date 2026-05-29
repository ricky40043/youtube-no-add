import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscriptionApi, authApi } from '../services/api'
import { motion } from 'framer-motion'
import VideoCard from '../components/VideoCard'

import ConfirmModal from '../components/ConfirmModal'

function Subscriptions() {
    const [subscriptions, setSubscriptions] = useState([])
    const [feedVideos, setFeedVideos] = useState([])
    const [loading, setLoading] = useState(true)
    const [feedLoading, setFeedLoading] = useState(true)
    const [error, setError] = useState(null)

    // Modal State
    const [showUnsubscribeModal, setShowUnsubscribeModal] = useState(false)
    const [selectedChannelId, setSelectedChannelId] = useState(null)

    const navigate = useNavigate()
    const user = authApi.getCurrentUser()

    // Fetch subscribed channel list (for management)
    const fetchSubscriptions = async () => {
        try {
            setLoading(true)
            const data = await subscriptionApi.getAll()
            setSubscriptions(data)
        } catch (err) {
            console.error(err)
            setError('無法載入訂閱清單')
        } finally {
            setLoading(false)
        }
    }

    // Fetch the latest videos from all subscribed channels (the actual feed)
    const fetchFeed = async () => {
        try {
            setFeedLoading(true)
            const data = await subscriptionApi.getFeed()
            setFeedVideos(Array.isArray(data) ? data : [])
        } catch (err) {
            console.error('Failed to load subscription feed:', err)
        } finally {
            setFeedLoading(false)
        }
    }

    useEffect(() => {
        if (!user) {
            navigate('/auth')
            return
        }
        fetchSubscriptions()
        fetchFeed()
    }, [user?.id, navigate])

    // Handle Unsubscribe Click
    const handleUnsubscribeClick = (e, channelId) => {
        e.stopPropagation()
        setSelectedChannelId(channelId)
        setShowUnsubscribeModal(true)
    }

    // Confirm Unsubscribe Action
    const confirmUnsubscribe = async () => {
        if (!selectedChannelId) return
        try {
            await subscriptionApi.unsubscribe(selectedChannelId)
            setSubscriptions(subscriptions.filter(sub => sub.channel_id !== selectedChannelId))
            fetchFeed() // refresh feed after unsubscribe
        } catch (err) {
            console.error(err)
            alert('取消訂閱失敗')
        }
    }

    // Handle Notification Toggle
    const handleToggleNotify = async (e, channelId) => {
        e.stopPropagation()
        try {
            const res = await subscriptionApi.toggleNotification(channelId)
            setSubscriptions(subs => subs.map(sub =>
                sub.channel_id === channelId
                    ? { ...sub, notify_enabled: res.notify_enabled }
                    : sub
            ))
        } catch (err) {
            console.error(err)
            alert('操作失敗')
        }
    }

    if (loading) return <div className="loading"><div className="spinner" /></div>

    return (
        <motion.div
            className="subscriptions-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <h1 style={{ marginBottom: '24px' }}>我的訂閱內容</h1>

            {error && <div className="error-message">{error}</div>}

            {/* === 最新影片：來自所有訂閱頻道的近期上傳 === */}
            <section className="subs-section">
                <h2 className="section-title">最新影片</h2>
                {feedLoading ? (
                    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>載入中...</div>
                ) : feedVideos.length === 0 ? (
                    <div className="empty-state">
                        <p>{subscriptions.length === 0
                            ? '您還沒有訂閱任何頻道。'
                            : '訂閱的頻道目前沒有可顯示的影片。'}</p>
                    </div>
                ) : (
                    <div className="video-grid">
                        {feedVideos.map(video => (
                            <VideoCard key={video.id} video={video} />
                        ))}
                    </div>
                )}
            </section>

            {/* === 訂閱頻道管理 === */}
            {subscriptions.length > 0 && (
                <section className="subs-section">
                    <h2 className="section-title">訂閱頻道</h2>
                    <div className="subscriptions-grid">
                        {subscriptions.map(sub => (
                            <div key={sub.id} className="subscription-card">
                                <div className="channel-info">
                                    {sub.channel_thumbnail && (
                                        <img src={sub.channel_thumbnail} alt={sub.channel_name} className="channel-thumb" />
                                    )}
                                    <div className="channel-details">
                                        <h3>{sub.channel_name}</h3>
                                        <span className="sub-date">訂閱於 {new Date(sub.subscribed_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className="card-actions">
                                    <button
                                        className={`notify-btn ${sub.notify_enabled ? 'active' : ''}`}
                                        onClick={(e) => handleToggleNotify(e, sub.channel_id)}
                                        title={sub.notify_enabled ? "關閉通知" : "開啟通知"}
                                    >
                                        {sub.notify_enabled ? (
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M7.58 4.08L6.15 2.65C3.75 4.48 2.17 7.3 2.03 10.5h2c.15-2.65 1.51-4.97 3.55-6.42zm12.39 6.42h2c-.15-3.2-1.73-6.02-4.12-7.85l-1.42 1.43c2.02 1.45 3.39 3.77 3.54 6.42zM18 11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2v-5zm-6 11c.14 0 .27-.01.4-.04.65-.14 1.18-.58 1.44-1.18.1-.24.16-.49.16-.78h-4c0 1.1.9 2 2 2z" />
                                            </svg>
                                        ) : (
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        className="unsubscribe-btn"
                                        onClick={(e) => handleUnsubscribeClick(e, sub.channel_id)}
                                    >
                                        取消訂閱
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <ConfirmModal
                isOpen={showUnsubscribeModal}
                onClose={() => setShowUnsubscribeModal(false)}
                onConfirm={confirmUnsubscribe}
                title="取消訂閱"
                message="確定要取消訂閱此頻道嗎？這項操作無法復原。"
                confirmText="確認取消"
            />

            <style>{`
                .subscriptions-page {
                    padding: 20px;
                    max-width: 1280px;
                    margin: 0 auto;
                }
                .subs-section {
                    margin-bottom: 32px;
                }
                .section-title {
                    font-size: 1.15rem;
                    margin-bottom: 16px;
                    color: var(--text-primary);
                }
                .empty-state {
                    padding: 32px;
                    text-align: center;
                    color: var(--text-secondary);
                }
                .subscriptions-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 16px;
                }
                .subscription-card {
                    background: var(--bg-secondary);
                    padding: 16px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    border: 1px solid transparent;
                    transition: border-color 0.2s;
                }
                .card-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0; /* never let actions shrink/overlap */
                }
                .channel-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-width: 0;
                }
                .channel-thumb {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    object-fit: cover;
                    flex-shrink: 0;
                }
                .channel-details {
                    min-width: 0; /* allow text-overflow: ellipsis to work in flex child */
                }
                .channel-details h3 {
                    margin: 0 0 4px 0;
                    font-size: 1rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .sub-date {
                    font-size: 0.8rem;
                    color: #888;
                }
                .unsubscribe-btn {
                    padding: 6px 12px;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    border-radius: 16px;
                    color: #aaa;
                    cursor: pointer;
                    font-size: 0.85rem;
                    white-space: nowrap;
                }
                .unsubscribe-btn:hover {
                    background: rgba(255, 50, 50, 0.2);
                    color: #ff5555;
                }
                .notify-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px;
                    border-radius: 50%;
                    transition: all 0.2s;
                }
                .notify-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--text-primary);
                }
                .notify-btn.active {
                    color: var(--accent-color);
                }
                .notify-btn svg {
                    width: 24px;
                    height: 24px;
                }
            `}</style>
        </motion.div>
    )
}

export default Subscriptions
