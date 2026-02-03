import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, historyApi } from '../services/api'
import api from '../services/api' // For playlists
import VideoCard from '../components/VideoCard'

function Profile() {
    const [user, setUser] = useState(authApi.getCurrentUser())
    const [history, setHistory] = useState([])
    const [playlists, setPlaylists] = useState([])
    const navigate = useNavigate()

    useEffect(() => {
        if (!user) {
            navigate('/auth')
            return
        }
        fetchData()
    }, [user])

    const fetchData = async () => {
        try {
            // Fetch History (limit 10 for preview)
            // Note: historyApi.get expects userId
            if (user.id) {
                const histData = await historyApi.get(user.id)
                setHistory(histData.slice(0, 10))

                // Fetch Playlists
                const playlistsData = await api.get('/api/playlists', {
                    params: { user_id: user.id }
                })
                setPlaylists(playlistsData.data)
            }
        } catch (error) {
            console.error("Failed to fetch profile data", error)
        }
    }

    const handleLogout = () => {
        authApi.logout()
        navigate('/')
    }

    if (!user) return null

    return (
        <div className="profile-page">
            {/* Header Section */}
            <div className="profile-header">
                <div className="profile-avatar">
                    {user.username[0].toUpperCase()}
                </div>
                <div className="profile-info">
                    <h1>{user.username}</h1>
                    <p>@{user.username}</p>
                </div>
                <button onClick={handleLogout} className="logout-btn">
                    Logout
                </button>
            </div>

            {/* History Section */}
            <div className="profile-section">
                <div className="section-header">
                    <h2>History</h2>
                    <button onClick={() => navigate('/history')}>View All</button>
                </div>
                {history.length > 0 ? (
                    <div className="horizontal-scroll-list">
                        {history.map(video => (
                            <div key={video.id} className="mini-video-card" onClick={() => navigate(`/watch/${video.video_id}`)}>
                                <img src={video.thumbnail} alt={video.title} />
                                <div className="mini-card-info">
                                    <div className="title">{video.title}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="empty-state">No watch history yet</p>
                )}
            </div>

            {/* Playlists Section */}
            <div className="profile-section">
                <div className="section-header">
                    <h2>Playlists</h2>
                    <button onClick={() => navigate('/playlists')}>View All</button>
                </div>
                {playlists.length > 0 ? (
                    <div className="playlist-list">
                        {playlists.map(playlist => (
                            <div key={playlist.id} className="playlist-item" onClick={() => navigate(`/playlists/${playlist.id}`)}>
                                <div className="playlist-icon">📂</div>
                                <div className="playlist-info">
                                    <h3>{playlist.title}</h3>
                                    <p>{playlist.items ? playlist.items.length : 0} videos</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="empty-state">No playlists created</p>
                )}
            </div>

            <style>{`
                .profile-page {
                    padding-bottom: 80px; /* Space for BottomNav */
                }
                
                .profile-header {
                    display: flex;
                    align-items: center;
                    padding: 24px 0;
                    margin-bottom: 16px;
                    border-bottom: 1px solid var(--border);
                }
                
                .profile-avatar {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: var(--accent);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                    font-weight: bold;
                    margin-right: 20px;
                }
                
                .profile-info {
                    flex: 1;
                }
                
                .profile-info h1 {
                    font-size: 24px;
                    margin-bottom: 4px;
                }
                
                .profile-info p {
                    color: var(--text-secondary);
                }
                
                .logout-btn {
                    padding: 8px 16px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                    color: var(--text-primary);
                    border-radius: 20px;
                    font-weight: 500;
                }
                
                .profile-section {
                    margin-bottom: 32px;
                }
                
                .section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                
                .section-header h2 {
                    font-size: 20px;
                    font-weight: bold;
                }
                
                .section-header button {
                    color: var(--accent);
                    font-size: 14px;
                    cursor: pointer;
                }
                
                .horizontal-scroll-list {
                    display: flex;
                    overflow-x: auto;
                    gap: 16px;
                    padding-bottom: 16px;
                    /* Hide scrollbar */
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                
                .horizontal-scroll-list::-webkit-scrollbar {
                    display: none;
                }
                
                .mini-video-card {
                    min-width: 160px;
                    width: 160px;
                    cursor: pointer;
                }
                
                .mini-video-card img {
                    width: 100%;
                    aspect-ratio: 16/9;
                    object-fit: cover;
                    border-radius: 8px;
                    margin-bottom: 8px;
                }
                
                .mini-card-info .title {
                    font-size: 14px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    line-height: 1.4;
                }
                
                .playlist-list {
                    display: grid;
                    gap: 12px;
                }
                
                .playlist-item {
                    display: flex;
                    align-items: center;
                    padding: 12px;
                    background: var(--bg-secondary);
                    border-radius: 8px;
                    cursor: pointer;
                }
                
                .playlist-icon {
                    font-size: 24px;
                    margin-right: 16px;
                    width: 40px;
                    height: 40px;
                    background: var(--bg-tertiary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                }
                
                .playlist-info h3 {
                    font-size: 16px;
                    font-weight: 500;
                    margin-bottom: 4px;
                }
                
                .playlist-info p {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                
                .empty-state {
                    color: var(--text-muted);
                    font-style: italic;
                    padding: 16px 0;
                }
            `}</style>
        </div>
    )
}

export default Profile
