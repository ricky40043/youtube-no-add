import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

import api, { authApi, historyApi } from '../services/api'
import VideoCard from '../components/VideoCard'
import ConfirmModal from '../components/ConfirmModal'

function History() {
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState(authApi.getCurrentUser())
    const navigate = useNavigate()
    
    // Swipe state
    const [swipedId, setSwipedId] = useState(null)
    const touchStartX = useRef(0)
    const touchStartY = useRef(0)
    
    // Modal state
    const [modalOpen, setModalOpen] = useState(false)
    const [modalConfig, setModalConfig] = useState({ title: '', message: '', onConfirm: () => {} })

    const fetchHistory = async () => {
        try {
            setLoading(true)
            const data = await historyApi.get(user.id)
            setHistory(data)
        } catch (err) {
            console.error("Failed to load history", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!user) {
            navigate('/auth')
            return
        }
        fetchHistory()
    }, [user, navigate])

    const handleDeleteItem = async (videoId, e) => {
        e?.stopPropagation()
        setModalConfig({
            title: '刪除觀看紀錄',
            message: '確定要刪除這筆觀看紀錄嗎？',
            onConfirm: async () => {
                try {
                    await historyApi.deleteItem(user.id, videoId)
                    setHistory(prev => prev.filter(item => item.video_id !== videoId))
                } catch (err) {
                    console.error("Failed to delete history item", err)
                    alert('刪除失敗')
                }
            }
        })
        setModalOpen(true)
    }

    const handleClearAll = async () => {
        setModalConfig({
            title: '清空觀看紀錄',
            message: '確定要清空所有觀看紀錄嗎？此動作無法復原。',
            onConfirm: async () => {
                try {
                    await historyApi.clearAll(user.id)
                    setHistory([])
                } catch (err) {
                    console.error("Failed to clear history", err)
                    alert('清空失敗')
                }
            }
        })
        setModalOpen(true)
    }

    // Touch handlers for swipe
    const handleTouchStart = (e, itemId) => {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e, itemId) => {
        const deltaX = e.touches[0].clientX - touchStartX.current
        const deltaY = e.touches[0].clientY - touchStartY.current
        
        // Only trigger horizontal swipe, not vertical scroll
        if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < -50) {
            setSwipedId(itemId)
        }
    }

    const handleTouchEnd = () => {
        // Keep swiped state until explicitly closed
    }

    const closeSwipe = () => {
        setSwipedId(null)
    }

    return (
        <div className="history-page" onClick={closeSwipe}>
            <ConfirmModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmText="確定刪除"
                cancelText="取消"
            />
            
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>觀看紀錄</h1>
                {history.length > 0 && (
                    <button className="clear-all-btn" onClick={handleClearAll}>
                        🗑️ 清空全部
                    </button>
                )}
            </header>

            {loading ? (
                <div className="loading">載入紀錄中...</div>
            ) : history.length === 0 ? (
                <div className="empty-state">尚無觀看紀錄。</div>
            ) : (
                <div className="video-grid">
                    {history.map(item => (
                        <div 
                            key={item.id} 
                            className={`history-item ${swipedId === item.id ? 'swiped' : ''}`}
                            onClick={() => swipedId === item.id ? closeSwipe() : navigate(`/watch/${item.video_id}`)}
                            onTouchStart={(e) => handleTouchStart(e, item.id)}
                            onTouchMove={(e) => handleTouchMove(e, item.id)}
                            onTouchEnd={handleTouchEnd}
                        >
                            <div className="swipe-actions">
                                <button 
                                    className="swipe-delete-btn"
                                    onClick={(e) => handleDeleteItem(item.video_id, e)}
                                >
                                    <span className="swipe-icon">🗑️</span>
                                    <span>刪除</span>
                                </button>
                            </div>
                            
                            <div className="history-content">
                                <div className="thumbnail-wrapper">
                                    <img src={item.thumbnail} alt={item.title} />
                                    <div className="progress-bar-bottom">
                                        <div
                                            className="progress-val"
                                            style={{ width: `${(item.progress_seconds / (item.video_duration || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="item-info">
                                    <h3>{item.title}</h3>
                                    <div className="item-meta">
                                        <span className="date">
                                            {new Date(item.watched_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
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
                    position: relative;
                    overflow: hidden;
                    border-radius: 12px;
                }
                .history-content {
                    cursor: pointer;
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    overflow: hidden;
                    transition: transform 0.2s;
                }
                .history-item:hover .history-content {
                    transform: translateY(-4px);
                }
                .history-item.swiped .history-content {
                    transform: translateX(-80px);
                }
                .swipe-actions {
                    position: absolute;
                    right: 0;
                    top: 0;
                    bottom: 0;
                    width: 80px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .history-item.swiped .swipe-actions {
                    opacity: 1;
                }
                .swipe-delete-btn {
                    width: 70px;
                    height: 100%;
                    background: #ff3b30;
                    border: none;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    color: white;
                    font-size: 12px;
                    cursor: pointer;
                }
                .swipe-icon {
                    font-size: 20px;
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
                .item-meta {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .clear-all-btn {
                    background: rgba(220, 38, 38, 0.15);
                    color: #ff6b6b;
                    border: 1px solid rgba(220, 38, 38, 0.4);
                    padding: 8px 20px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .clear-all-btn:hover {
                    background: rgba(220, 38, 38, 0.3);
                    border-color: rgba(220, 38, 38, 0.7);
                    color: #ff4d4f;
                }
                .progress-bar-bottom {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                    background: rgba(255,255,255,0.2);
                }
                .progress-val {
                    height: 100%;
                    background: #ff0000;
                }
                @media (min-width: 769px) {
                    .history-item.swiped .history-content {
                        transform: none;
                    }
                    .swipe-actions {
                        display: none;
                    }
                }
            `}</style>
        </div>
    )
}

export default History
