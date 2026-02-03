import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api, { authApi } from '../services/api'

function AddToPlaylistModal({ isOpen, onClose, videoInfo }) {
    const [playlists, setPlaylists] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [saving, setSaving] = useState(false)
    const [createMode, setCreateMode] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [message, setMessage] = useState('')

    const user = authApi.getCurrentUser()

    useEffect(() => {
        if (isOpen && user) {
            fetchPlaylists()
        }
    }, [isOpen])

    const fetchPlaylists = async () => {
        try {
            setLoading(true)
            const response = await api.get('/api/playlists/', {
                params: { user_id: user?.id || 1 }
            })
            setPlaylists(response.data)
        } catch (err) {
            console.error('Failed to fetch playlists:', err)
        } finally {
            setLoading(false)
        }
    }

    const toggleSelect = (id) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const handleCreate = async (e) => {
        e.preventDefault()
        if (!newTitle.trim()) return

        try {
            const response = await api.post('/api/playlists/', {
                title: newTitle.trim(),
                description: '',
                user_id: user?.id || 1
            })
            setPlaylists([...playlists, response.data])
            setSelectedIds(new Set([...selectedIds, response.data.id]))
            setNewTitle('')
            setCreateMode(false)
        } catch (err) {
            console.error('Failed to create playlist:', err)
        }
    }

    const handleSave = async () => {
        if (selectedIds.size === 0) {
            setMessage('請至少選擇一個播放清單')
            return
        }

        setSaving(true)
        setMessage('')

        try {
            const promises = Array.from(selectedIds).map(playlistId =>
                api.post(`/api/playlists/${playlistId}/items`, {
                    video_id: videoInfo.id,
                    title: videoInfo.title,
                    thumbnail: videoInfo.thumbnail,
                    duration: videoInfo.duration || 0,
                    position: 0
                })
            )

            await Promise.all(promises)
            setMessage('✓ 已加入播放清單！')
            setTimeout(() => {
                onClose()
                setSelectedIds(new Set())
                setMessage('')
            }, 800)
        } catch (err) {
            console.error('Failed to add to playlist:', err)
            if (err.response?.status === 400) {
                setMessage('影片已在播放清單中')
            } else {
                setMessage('加入失敗，請稍後再試')
            }
        } finally {
            setSaving(false)
        }
    }

    if (!user) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    >
                        <motion.div
                            className="modal-content"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h2>加入播放清單</h2>
                            <p className="login-prompt">請先登入以使用此功能</p>
                            <button className="close-btn" onClick={onClose}>關閉</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        )
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="modal-content"
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h2>加入播放清單</h2>

                        {loading ? (
                            <div className="loading-state">載入中...</div>
                        ) : (
                            <>
                                <div className="playlist-list">
                                    {playlists.length === 0 ? (
                                        <p className="empty-hint">尚無播放清單，請先建立一個</p>
                                    ) : (
                                        playlists.map(pl => (
                                            <label
                                                key={pl.id}
                                                className={`playlist-option ${selectedIds.has(pl.id) ? 'selected' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(pl.id)}
                                                    onChange={() => toggleSelect(pl.id)}
                                                />
                                                <span className="checkbox-custom">
                                                    {selectedIds.has(pl.id) ? '✓' : ''}
                                                </span>
                                                <span className="playlist-name">{pl.title}</span>
                                            </label>
                                        ))
                                    )}
                                </div>

                                {createMode ? (
                                    <form className="create-form" onSubmit={handleCreate}>
                                        <input
                                            type="text"
                                            placeholder="新播放清單名稱"
                                            value={newTitle}
                                            onChange={e => setNewTitle(e.target.value)}
                                            autoFocus
                                        />
                                        <button type="submit">建立</button>
                                        <button type="button" onClick={() => setCreateMode(false)}>取消</button>
                                    </form>
                                ) : (
                                    <button
                                        className="new-playlist-btn"
                                        onClick={() => setCreateMode(true)}
                                    >
                                        + 新增播放清單
                                    </button>
                                )}

                                {message && (
                                    <div className={`message ${message.includes('✓') ? 'success' : 'error'}`}>
                                        {message}
                                    </div>
                                )}

                                <div className="modal-actions">
                                    <button className="cancel-btn" onClick={onClose}>取消</button>
                                    <button
                                        className="save-btn"
                                        onClick={handleSave}
                                        disabled={saving || selectedIds.size === 0}
                                    >
                                        {saving ? '儲存中...' : '儲存'}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>

                    <style>{`
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
                            max-height: 80vh;
                            overflow-y: auto;
                        }
                        .modal-content h2 {
                            margin: 0 0 20px 0;
                            font-size: 1.25rem;
                            text-align: center;
                        }
                        .playlist-list {
                            margin-bottom: 16px;
                            max-height: 250px;
                            overflow-y: auto;
                        }
                        .playlist-option {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            padding: 12px;
                            border-radius: 8px;
                            cursor: pointer;
                            transition: background 0.2s;
                        }
                        .playlist-option:hover {
                            background: rgba(255, 255, 255, 0.05);
                        }
                        .playlist-option.selected {
                            background: rgba(255, 255, 255, 0.1);
                        }
                        .playlist-option input {
                            display: none;
                        }
                        .checkbox-custom {
                            width: 24px;
                            height: 24px;
                            border: 2px solid #666;
                            border-radius: 4px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 14px;
                            color: white;
                            transition: all 0.2s;
                        }
                        .playlist-option.selected .checkbox-custom {
                            background: var(--accent-color, #ff0050);
                            border-color: var(--accent-color, #ff0050);
                        }
                        .playlist-name {
                            flex: 1;
                            font-size: 1rem;
                        }
                        .empty-hint {
                            color: #888;
                            text-align: center;
                            padding: 20px 0;
                        }
                        .new-playlist-btn {
                            width: 100%;
                            padding: 12px;
                            background: transparent;
                            border: 1px dashed #555;
                            color: var(--text-secondary, #aaa);
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 0.95rem;
                            transition: all 0.2s;
                        }
                        .new-playlist-btn:hover {
                            border-color: var(--accent-color, #ff0050);
                            color: white;
                        }
                        .create-form {
                            display: flex;
                            gap: 8px;
                            margin-bottom: 12px;
                        }
                        .create-form input {
                            flex: 1;
                            padding: 10px;
                            border-radius: 8px;
                            border: 1px solid #444;
                            background: rgba(0, 0, 0, 0.3);
                            color: white;
                        }
                        .create-form button {
                            padding: 10px 16px;
                            border-radius: 8px;
                            border: none;
                            cursor: pointer;
                        }
                        .create-form button[type="submit"] {
                            background: var(--accent-color, #ff0050);
                            color: white;
                        }
                        .create-form button[type="button"] {
                            background: #333;
                            color: white;
                        }
                        .message {
                            text-align: center;
                            padding: 10px;
                            border-radius: 8px;
                            margin: 12px 0;
                        }
                        .message.success {
                            background: rgba(0, 200, 100, 0.2);
                            color: #00c864;
                        }
                        .message.error {
                            background: rgba(255, 0, 0, 0.2);
                            color: #ff6b6b;
                        }
                        .modal-actions {
                            display: flex;
                            gap: 12px;
                            margin-top: 20px;
                        }
                        .modal-actions button {
                            flex: 1;
                            padding: 12px;
                            border-radius: 24px;
                            border: none;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        .cancel-btn {
                            background: #333;
                            color: white;
                        }
                        .save-btn {
                            background: var(--accent-color, #ff0050);
                            color: white;
                        }
                        .save-btn:disabled {
                            opacity: 0.5;
                            cursor: not-allowed;
                        }
                        .login-prompt {
                            text-align: center;
                            color: #888;
                            padding: 30px 0;
                        }
                        .close-btn {
                            width: 100%;
                            padding: 12px;
                            background: #333;
                            color: white;
                            border: none;
                            border-radius: 24px;
                            cursor: pointer;
                        }
                        .loading-state {
                            text-align: center;
                            padding: 40px 0;
                            color: #888;
                        }
                    `}</style>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export default AddToPlaylistModal
