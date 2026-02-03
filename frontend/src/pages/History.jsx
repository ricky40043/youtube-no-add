import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

import api, { authApi } from '../services/api'
import VideoCard from '../components/VideoCard'

function History() {
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState(authApi.getCurrentUser())
    const navigate = useNavigate()

    useEffect(() => {
        if (!user) {
            navigate('/auth')
            return
        }

        const fetchHistory = async () => {
            try {
                // Hardcoded user_id=1 for now until full auth integration
                // In real app, we get this from token/context or /me endpoint

                const response = await api.get('/api/history', {
                    params: { user_id: 1 } // Mock ID, real backend uses token
                })
                setHistory(response.data)
            } catch (err) {
                console.error("Failed to load history", err)
            } finally {
                setLoading(false)
            }
        }

        fetchHistory()
    }, [user, navigate])

    // Fix: We should use the configured api instance instead of axios direct
    // But api instance needs Update to handle history endpoint properly

    return (
        <div className="history-page">
            <header className="page-header">
                <h1>Watch History</h1>
            </header>

            {loading ? (
                <div className="loading">Loading history...</div>
            ) : history.length === 0 ? (
                <div className="empty-state">No watch history yet.</div>
            ) : (
                <div className="video-grid">
                    {history.map(item => (
                        <div key={item.id} className="history-item" onClick={() => navigate(`/watch/${item.video_id}`)}>
                            <div className="thumbnail-wrapper">
                                <img src={item.thumbnail} alt={item.title} />
                                <div className="progress-bar-bottom">
                                    <div
                                        className="progress-val"
                                        style={{ width: '100%' }} // Use item.progress_seconds if available
                                    />
                                </div>
                            </div>
                            <div className="item-info">
                                <h3>{item.title}</h3>
                                <span className="date">
                                    {new Date(item.watched_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .history-page {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .page-header {
                    margin-bottom: 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 10px;
                }
                .video-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 20px;
                }
                .history-item {
                    cursor: pointer;
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    overflow: hidden;
                    transition: transform 0.2s;
                }
                .history-item:hover {
                    transform: translateY(-4px);
                }
                .thumbnail-wrapper {
                    position: relative;
                    aspect-ratio: 16/9;
                }
                .thumbnail-wrapper img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .item-info {
                    padding: 12px;
                }
                .item-info h3 {
                    font-size: 14px;
                    margin: 0 0 8px 0;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .date {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
            `}</style>
        </div>
    )
}

export default History
