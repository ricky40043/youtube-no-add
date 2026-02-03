import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import api, { authApi } from '../services/api'

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
            const response = await api.get('/api/playlists', {
                params: { user_id: user?.id }
            })
            setPlaylists(response.data)
        } catch (err) {
            console.error("Failed to load playlists", err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async (e) => {
        e.preventDefault()
        try {
            await api.post('/api/playlists', {
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
            await api.post('/api/playlists/import', {
                url: importUrl,
                user_id: user?.id
            })
            setImportUrl('')
            setImportMode(false)
            fetchPlaylists()
        } catch (err) {
            console.error(err)
            alert('Failed to import playlist. Please check the URL.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="playlists-page">
            <header className="page-header">
                <h1>My Playlists</h1>
                <div className="actions">
                    <button
                        className="create-btn"
                        onClick={() => { setCreateMode(!createMode); setImportMode(false); }}
                    >
                        + Create
                    </button>
                    <button
                        className="import-btn"
                        onClick={() => { setImportMode(!importMode); setCreateMode(false); }}
                    >
                        Import YouTube
                    </button>
                </div>
            </header>

            {createMode && (
                <form className="create-form" onSubmit={handleCreate}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="Playlist Title"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                    />
                    <button type="submit">Create</button>
                </form>
            )}

            {importMode && (
                <form className="create-form" onSubmit={handleImport}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="YouTube Playlist URL (e.g. https://www.youtube.com/playlist?list=...)"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        required
                    />
                    <button type="submit">Import</button>
                </form>
            )}

            {loading ? (
                <div className="loading">Loading playlists...</div>
            ) : playlists.length === 0 ? (
                <div className="empty-state">
                    No playlists yet. Create one to organize your videos!
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
                                <p>{pl.items_count || 0} videos</p>
                                <span className="date">Created {new Date(pl.created_at).toLocaleDateString()}</span>
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
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 20px;
                }
                .playlist-card {
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    height: 150px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: all 0.2s;
                    text-align: center;
                }
                .playlist-card:hover {
                    border-color: var(--accent-color);
                    transform: translateY(-2px);
                }
                .card-content h3 {
                    margin: 0 0 8px 0;
                }
                .card-content p {
                    color: var(--text-secondary);
                    margin: 0 0 8px 0;
                }
                .date {
                    font-size: 12px;
                    color: #666;
                }
            `}</style>
        </div>
    )
}

export default Playlists
