import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, historyApi } from '../services/api'
import api from '../services/api' // For playlists

function Profile() {
    const [user] = useState(authApi.getCurrentUser())
    const [history, setHistory] = useState([])
    const [playlists, setPlaylists] = useState([])
    const [accountDetails, setAccountDetails] = useState(null)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [recoveryEmail, setRecoveryEmail] = useState('')
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('')
    const [securityMessage, setSecurityMessage] = useState('')
    const [securityError, setSecurityError] = useState('')
    const [securityLoading, setSecurityLoading] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        if (!user) {
            navigate('/auth')
            return
        }
        fetchData()
        authApi.getMe()
            .then(data => {
                setAccountDetails(data)
                setRecoveryEmail(data.email || '')
            })
            .catch(error => console.error('Failed to load account details', error))
    }, [user])

    const fetchData = async () => {
        try {
            // Fetch History (limit 10 for preview)
            if (user.id) {
                const histData = await historyApi.get()
                setHistory(histData.slice(0, 10))

                // Fetch Playlists
                const playlistsData = await api.get('/api/playlists')
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

    const handleChangePassword = async (event) => {
        event.preventDefault()
        setSecurityError('')
        setSecurityMessage('')
        if (newPassword !== confirmPassword) {
            setSecurityError('兩次輸入的新密碼不一致')
            return
        }

        setSecurityLoading(true)
        try {
            const data = await authApi.changePassword(currentPassword, newPassword)
            setSecurityMessage(data.message)
            authApi.logout()
            setTimeout(() => navigate('/auth', { replace: true }), 1000)
        } catch (error) {
            setSecurityError(error.response?.data?.detail || '密碼更新失敗')
        } finally {
            setSecurityLoading(false)
        }
    }

    const handleRecoveryEmail = async (event) => {
        event.preventDefault()
        setSecurityError('')
        setSecurityMessage('')
        setSecurityLoading(true)
        try {
            const data = await authApi.requestRecoveryEmail(emailCurrentPassword, recoveryEmail)
            setSecurityMessage(data.message)
        } catch (error) {
            setSecurityError(error.response?.data?.detail || '恢復信箱設定失敗')
        } finally {
            setSecurityLoading(false)
        }
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
                    登出
                </button>
            </div>

            {/* History Section */}
            <div className="profile-section">
                <div className="section-header">
                    <h2>觀看紀錄</h2>
                    <button onClick={() => navigate('/history')}>查看全部</button>
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
                    <p className="empty-state">尚無觀看紀錄</p>
                )}
            </div>

            <div className="profile-section account-security-section">
                <div className="section-header">
                    <div>
                        <h2>帳戶安全</h2>
                        <p className="security-description">管理密碼與忘記密碼時使用的恢復信箱</p>
                    </div>
                </div>

                {securityError && <div className="security-alert error">{securityError}</div>}
                {securityMessage && <div className="security-alert success">{securityMessage}</div>}

                <div className="security-grid">
                    <form className="security-card" onSubmit={handleChangePassword}>
                        <h3>更改密碼</h3>
                        <label htmlFor="profile-current-password">目前密碼</label>
                        <input
                            id="profile-current-password"
                            type="password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            required
                            autoComplete="current-password"
                        />
                        <label htmlFor="profile-new-password">新密碼</label>
                        <input
                            id="profile-new-password"
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                        />
                        <label htmlFor="profile-confirm-password">再次輸入新密碼</label>
                        <input
                            id="profile-confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                        />
                        <button type="submit" className="security-primary-btn" disabled={securityLoading}>
                            更新密碼
                        </button>
                    </form>

                    <form className="security-card" onSubmit={handleRecoveryEmail}>
                        <div className="security-card-heading">
                            <h3>恢復信箱</h3>
                            {accountDetails?.email_verified && <span className="verified-badge">已驗證</span>}
                        </div>
                        <p>忘記密碼時，重設連結會寄到這個信箱。</p>
                        <label htmlFor="profile-recovery-email">Email</label>
                        <input
                            id="profile-recovery-email"
                            type="email"
                            value={recoveryEmail}
                            onChange={(event) => setRecoveryEmail(event.target.value)}
                            required
                            autoComplete="email"
                            placeholder="name@example.com"
                        />
                        <label htmlFor="profile-email-password">目前密碼</label>
                        <input
                            id="profile-email-password"
                            type="password"
                            value={emailCurrentPassword}
                            onChange={(event) => setEmailCurrentPassword(event.target.value)}
                            required
                            autoComplete="current-password"
                        />
                        <button type="submit" className="security-primary-btn" disabled={securityLoading}>
                            寄送驗證信
                        </button>
                    </form>
                </div>
            </div>

            {/* Playlists Section */}
            <div className="profile-section">
                <div className="section-header">
                    <h2>播放清單</h2>
                    <button onClick={() => navigate('/playlists')}>查看全部</button>
                </div>
                {playlists.length > 0 ? (
                    <div className="playlist-list">
                        {playlists.map(playlist => (
                            <div key={playlist.id} className="playlist-item" onClick={() => navigate(`/playlists/${playlist.id}`)}>
                                <div className="playlist-icon">📂</div>
                                <div className="playlist-info">
                                    <h3>{playlist.title}</h3>
                                    <p>{playlist.items ? playlist.items.length : 0} 部影片</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="empty-state">尚無播放清單</p>
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

                .account-security-section {
                    padding-top: 8px;
                }

                .security-description {
                    margin-top: 4px;
                    color: var(--text-secondary);
                    font-size: 14px;
                }

                .security-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 18px;
                }

                .security-card {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    padding: 20px;
                    border: 1px solid var(--border);
                    border-radius: 14px;
                    background: var(--bg-secondary);
                }

                .security-card h3 {
                    font-size: 18px;
                }

                .security-card p,
                .security-card label {
                    color: var(--text-secondary);
                    font-size: 13px;
                }

                .security-card input {
                    width: 100%;
                    padding: 11px 12px;
                    border: 1px solid var(--border);
                    border-radius: 9px;
                    outline: none;
                    background: rgba(0,0,0,.24);
                    color: white;
                }

                .security-card input:focus {
                    border-color: var(--accent);
                }

                .security-primary-btn {
                    margin-top: 8px;
                    padding: 11px 14px;
                    border-radius: 9px;
                    background: var(--accent);
                    color: white;
                    font-weight: 700;
                }

                .security-primary-btn:disabled {
                    opacity: .6;
                }

                .security-card-heading {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .verified-badge {
                    padding: 3px 8px;
                    border-radius: 999px;
                    background: rgba(22,163,74,.18);
                    color: #83e6ad;
                    font-size: 12px;
                }

                .security-alert {
                    padding: 12px 14px;
                    margin-bottom: 16px;
                    border-radius: 9px;
                    font-size: 14px;
                }

                .security-alert.error { color: #ff8b8b; background: rgba(255,0,0,.12); }
                .security-alert.success { color: #83e6ad; background: rgba(22,163,74,.12); }

                @media (max-width: 720px) {
                    .security-grid { grid-template-columns: 1fr; }
                    .profile-header { padding-left: 16px; padding-right: 16px; }
                    .profile-section { padding-left: 16px; padding-right: 16px; }
                }
            `}</style>
        </div>
    )
}

export default Profile
