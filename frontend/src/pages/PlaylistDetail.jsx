import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import api from '../services/api'
import VideoCard from '../components/VideoCard'

function PlaylistDetail() {
    const { id } = useParams()
    const [playlist, setPlaylist] = useState(null)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        fetchPlaylistData()
    }, [id])

    const fetchPlaylistData = async () => {
        try {
            const [plRes, itemsRes] = await Promise.all([
                api.get(`/api/playlists/${id}`),
                api.get(`/api/playlists/${id}/items`)
            ])
            setPlaylist(plRes.data)
            setItems(itemsRes.data)
            setEditTitle(plRes.data.title || '')
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            await api.delete(`/api/playlists/${id}`)
            navigate('/playlists')
        } catch (err) {
            console.error(err)
            alert('刪除失敗，請稍後再試')
        } finally {
            setDeleting(false)
            setShowDeleteConfirm(false)
        }
    }

    const handleSaveEdit = async () => {
        if (!editTitle.trim()) return
        try {
            const response = await api.put(`/api/playlists/${id}`, {
                title: editTitle.trim()
            })
            setPlaylist(response.data)
            setIsEditing(false)
        } catch (err) {
            console.error(err)
            alert('儲存失敗，請稍後再試')
        }
    }

    const handleRemoveItem = async (itemId) => {
        try {
            await api.delete(`/api/playlists/${id}/items/${itemId}`)
            setItems(items.filter(item => item.id !== itemId))
        } catch (err) {
            console.error(err)
        }
    }

    if (loading) return <div className="loading">載入中...</div>
    if (!playlist) return <div className="error">找不到播放清單</div>

    return (
        <div className="playlist-detail-page">
            <header className="playlist-header">
                <div className="header-content">
                    {isEditing ? (
                        <div className="edit-form">
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="播放清單名稱"
                                autoFocus
                            />
                            <div className="edit-actions">
                                <button className="save-edit-btn" onClick={handleSaveEdit}>儲存</button>
                                <button className="cancel-edit-btn" onClick={() => {
                                    setIsEditing(false)
                                    setEditTitle(playlist.title)
                                }}>取消</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="title-row">
                                <h1>{playlist.title}</h1>
                                <button className="edit-btn" onClick={() => setIsEditing(true)} title="編輯名稱">
                                    ✏️
                                </button>
                            </div>
                            <p>{playlist.description}</p>
                        </>
                    )}
                    <div className="stats">
                        {items.length} 部影片 • 建立於 {new Date(playlist.created_at).toLocaleDateString()}
                    </div>
                </div>
                <div className="header-actions">
                    <button className="play-all-btn" onClick={() => items.length > 0 && navigate(`/watch/${items[0].video_id}?list=${id}&index=0`)}>
                        ▶ 播放全部
                    </button>
                    <button className="delete-btn" onClick={() => setShowDeleteConfirm(true)}>
                        刪除清單
                    </button>
                </div>
            </header>

            <div className="items-list">
                {items.length === 0 ? (
                    <div className="empty-state">
                        此播放清單是空的。
                    </div>
                ) : (
                    items.map((item, index) => (
                        <div key={item.id} className="playlist-item">
                            <span className="index">{index + 1}</span>
                            <div className="thumbnail" onClick={() => navigate(`/watch/${item.video_id}?list=${id}&index=${index}`)}>
                                <img src={item.thumbnail || item.video_thumbnail} alt={item.title || item.video_title} />
                                <span className="duration">{formatDuration(item.duration || item.video_duration)}</span>
                            </div>
                            <div className="info" onClick={() => navigate(`/watch/${item.video_id}?list=${id}&index=${index}`)}>
                                <h3>{item.title || item.video_title}</h3>
                            </div>
                            <button
                                className="remove-item-btn"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleRemoveItem(item.id)
                                }}
                                title="從清單中移除"
                            >
                                ✕
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>確認刪除</h3>
                        <p>確定要刪除「{playlist.title}」嗎？此操作無法復原。</p>
                        <div className="modal-actions">
                            <button
                                className="cancel-btn"
                                onClick={() => setShowDeleteConfirm(false)}
                            >
                                取消
                            </button>
                            <button
                                className="confirm-delete-btn"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? '刪除中...' : '確認刪除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .playlist-detail-page {
                    padding: 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .playlist-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 30px;
                    background: var(--bg-secondary);
                    padding: 24px;
                    border-radius: 16px;
                }
                .header-content {
                    flex: 1;
                }
                .title-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .header-content h1 {
                    margin: 0 0 8px 0;
                    font-size: 24px;
                }
                .edit-btn {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    font-size: 18px;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }
                .edit-btn:hover {
                    opacity: 1;
                }
                .edit-form {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .edit-form input {
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid #444;
                    background: rgba(0,0,0,0.3);
                    color: white;
                    font-size: 18px;
                    font-weight: bold;
                }
                .edit-actions {
                    display: flex;
                    gap: 8px;
                }
                .save-edit-btn, .cancel-edit-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    font-weight: bold;
                }
                .save-edit-btn {
                    background: var(--accent-color);
                    color: white;
                }
                .cancel-edit-btn {
                    background: #333;
                    color: white;
                }
                .header-content p {
                    color: var(--text-secondary);
                    margin: 0 0 16px 0;
                }
                .stats {
                    font-size: 14px;
                    color: #888;
                }
                .header-actions {
                    display: flex;
                    gap: 12px;
                }
                .play-all-btn {
                    background: white;
                    color: black;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 24px;
                    font-weight: bold;
                    cursor: pointer;
                }
                .delete-btn {
                    background: rgba(255,0,0,0.2);
                    color: #ff4444;
                    border: 1px solid rgba(255,0,0,0.3);
                    padding: 10px 16px;
                    border-radius: 24px;
                    cursor: pointer;
                }
                
                .playlist-item {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 12px;
                    border-radius: 8px;
                    transition: background 0.2s;
                }
                .playlist-item:hover {
                    background: rgba(255,255,255,0.05);
                }
                .index {
                    color: #888;
                    width: 24px;
                    text-align: center;
                }
                .thumbnail {
                    width: 160px;
                    aspect-ratio: 16/9;
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    cursor: pointer;
                }
                .thumbnail img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .duration {
                    position: absolute;
                    bottom: 4px;
                    right: 4px;
                    background: rgba(0,0,0,0.8);
                    padding: 2px 4px;
                    border-radius: 4px;
                    font-size: 12px;
                }
                .info {
                    flex: 1;
                    cursor: pointer;
                }
                .info h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 500;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .remove-item-btn {
                    background: transparent;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 8px;
                    opacity: 0;
                    transition: opacity 0.2s, color 0.2s;
                }
                .playlist-item:hover .remove-item-btn {
                    opacity: 1;
                }
                .remove-item-btn:hover {
                    color: #ff4444;
                }
                
                /* Modal Styles */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                }
                .modal-content {
                    background: var(--bg-secondary, #1a1a1a);
                    border-radius: 16px;
                    padding: 24px;
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                }
                .modal-content h3 {
                    margin: 0 0 16px 0;
                    font-size: 20px;
                }
                .modal-content p {
                    color: var(--text-secondary);
                    margin: 0 0 24px 0;
                }
                .modal-actions {
                    display: flex;
                    gap: 12px;
                }
                .modal-actions button {
                    flex: 1;
                    padding: 12px;
                    border-radius: 24px;
                    border: none;
                    font-weight: 600;
                    cursor: pointer;
                }
                .cancel-btn {
                    background: #333;
                    color: white;
                }
                .confirm-delete-btn {
                    background: #ff4444;
                    color: white;
                }
                .confirm-delete-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    )
}

function formatDuration(seconds) {
    if (!seconds) return '0:00'
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
}

export default PlaylistDetail
