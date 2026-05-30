import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import api, { authApi, playlistApi } from '../services/api'

function Playlists() {
    const [playlists, setPlaylists] = useState([])
    const [loading, setLoading] = useState(true)
    const [createMode, setCreateMode] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [user, setUser] = useState(authApi.getCurrentUser())
    const navigate = useNavigate()

    useEffect(() => {
        if (!user) {
            navigate('/auth')
            return
        }
        fetchPlaylists()
    }, [user, navigate])

    const fetchPlaylists = async () => {
        try {
            const data = await playlistApi.getAll(user?.id)
            setPlaylists(data)
        } catch (err) {
            console.error("Failed to load playlists", err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async (e) => {
        e.preventDefault()
        try {
            await playlistApi.create({
                title: newTitle,
                description: '',
                user_id: user?.id
            })

            setNewTitle('')
            setCreateMode(false)
            fetchPlaylists()
        } catch (err) {
            console.error(err)
        }
    }

    const [importMode, setImportMode] = useState(false)
    const [importUrl, setImportUrl] = useState('')

    const handleImport = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            await playlistApi.import({
                url: importUrl,
                user_id: user?.id
            })
            setImportUrl('')
            setImportMode(false)
            fetchPlaylists()
        } catch (err) {
            console.error(err)
            alert('匯入播放清單失敗，請確認網址是否正確。')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="playlists-page">
            <header className="page-header">
                <h1>我的播放清單</h1>
                <div className="actions">
                    <button
                        className="create-btn"
                        onClick={() => { setCreateMode(!createMode); setImportMode(false); }}
                    >
                        + 建立
                    </button>
                    <button
                        className="import-btn"
                        onClick={() => { setImportMode(!importMode); setCreateMode(false); }}
                    >
                        匯入 YouTube
                    </button>
                </div>
            </header>

            {createMode && (
                <form className="create-form" onSubmit={handleCreate}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="播放清單名稱"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                    />
                    <button type="submit">建立</button>
                </form>
            )}

            {importMode && (
                <form className="create-form" onSubmit={handleImport}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="YouTube 播放清單網址 (例如 https://www.youtube.com/playlist?list=...)"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        required
                    />
                    <button type="submit">匯入</button>
                </form>
            )}

            {loading ? (
                <div className="loading">載入播放清單中...</div>
            ) : playlists.length === 0 ? (
                <div className="empty-state">
                    尚無播放清單。建立一個來整理您的影片！
                </div>
            ) : (
                <div className="playlist-grid">
                    {playlists.map(pl => (
                        <div
                            key={pl.id}
                            className="playlist-card"
                            onClick={() => navigate(`/playlists/${pl.id}`)}
                        >
                            <div className="card-content">
                                <h3>{pl.title}</h3>
                                <p>{pl.items_count || 0} 部影片</p>
                                <span className="date">建立於 {new Date(pl.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .playlists-page {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 10px;
                }
                .actions {
                    display: flex;
                    gap: 10px;
                }
                .create-btn, .import-btn {
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 20px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .create-btn {
                    background: var(--accent-color);
                }
                .import-btn {
                    background: #333;
                    border: 1px solid #555;
                }
                .create-form {
                    background: var(--bg-secondary);
                    padding: 20px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                    display: flex;
                    gap: 10px;
                }
                .create-form input {
                    flex: 1;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid #444;
                    background: rgba(0,0,0,0.3);
                    color: white;
                }
                .playlist-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
                    gap: 20px;
                }
                .playlist-card {
                    background: var(--bg-secondary);
                    border-radius: 16px;
                    min-height: 140px;
                    height: auto;
                    padding: 24px 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border: 1px solid rgba(255,255,255,0.05);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: center;
                }
                .playlist-card:hover {
                    border-color: var(--accent-color);
                    transform: translateY(-4px);
                    box-shadow: 0 8px 30px rgba(139,92,246,0.15);
                }
                .card-content {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .card-content h3 {
                    margin: 0 0 8px 0;
                    font-size: 16px;
                    line-height: 1.4;
                    font-weight: bold;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    color: #fff;
                }
                .card-content p {
                    color: var(--text-secondary);
                    margin: 0 0 8px 0;
                    font-size: 14px;
                }
                .date {
                    font-size: 12px;
                    color: #555;
                }
            `}</style>
        </div>
    )
}

export default Playlists
