import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import api from '../services/api'
import VideoCard from '../components/VideoCard'

function PlaylistDetail() {
    const { id } = useParams()
    const [playlist, setPlaylist] = useState(null)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
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
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this playlist?')) return;
        try {
            await api.delete(`/api/playlists/${id}`)
            navigate('/playlists')
        } catch (err) {
            console.error(err)
        }
    }

    if (loading) return <div className="loading">Loading...</div>
    if (!playlist) return <div className="error">Playlist not found</div>

    return (
        <div className="playlist-detail-page">
            <header className="playlist-header">
                <div className="header-content">
                    <h1>{playlist.title}</h1>
                    <p>{playlist.description}</p>
                    <div className="stats">
                        {items.length} videos • Updated {new Date(playlist.updated_at).toLocaleDateString()}
                    </div>
                </div>
                <div className="header-actions">
                    <button className="play-all-btn" onClick={() => items.length > 0 && navigate(`/watch/${items[0].video_id}`)}>
                        ▶ Play All
                    </button>
                    <button className="delete-btn" onClick={handleDelete}>
                        Delete Playlist
                    </button>
                </div>
            </header>

            <div className="items-list">
                {items.length === 0 ? (
                    <div className="empty-state">
                        This playlist is empty.
                        {/* We needs a way to add videos. For now, maybe Search page integration? */}
                    </div>
                ) : (
                    items.map((item, index) => (
                        <div key={item.id} className="playlist-item" onClick={() => navigate(`/watch/${item.video_id}`)}>
                            <span className="index">{index + 1}</span>
                            <div className="thumbnail">
                                <img src={item.thumbnail} alt={item.title} />
                                <span className="duration">{formatDuration(item.duration)}</span>
                            </div>
                            <div className="info">
                                <h3>{item.title}</h3>
                            </div>
                        </div>
                    ))
                )}
            </div>

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
                .header-content h1 {
                    margin: 0 0 8px 0;
                    font-size: 24px;
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
                    cursor: pointer;
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
                .info h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 500;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
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
