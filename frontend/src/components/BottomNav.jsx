import { useNavigate, useLocation, Link } from 'react-router-dom'
import { authApi } from '../services/api'

function BottomNav() {
    const navigate = useNavigate()
    const location = useLocation()
    const user = authApi.getCurrentUser()

    // eslint-disable-next-line no-unused-vars
    const isActive = (path) => location.pathname === path

    const handleProfileClick = () => {
        if (user) {
            navigate('/profile')
        } else {
            navigate('/auth')
        }
    }

    return (
        <div className="bottom-nav">

            <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
                <span className="icon">🏠</span>
                <span className="label">首頁</span>
            </Link>

            <Link to="/playlists" className={`nav-item ${location.pathname.startsWith('/playlists') ? 'active' : ''}`}>
                <span className="icon">📑</span>
                <span className="label">播放清單</span>
            </Link>

            <Link to="/history" className={`nav-item ${location.pathname === '/history' ? 'active' : ''}`}>
                <span className="icon">🕒</span>
                <span className="label">紀錄</span>
            </Link>

            <button
                className={`nav-item ${isActive('/profile') || isActive('/auth') ? 'active' : ''}`}
                onClick={handleProfileClick}
            >
                {user ? (
                    <div className="nav-avatar">
                        {user.username[0].toUpperCase()}
                    </div>
                ) : (
                    <svg viewBox="0 0 24 24" fill={location.pathname.includes('/auth') ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                )}
                <span>你</span>
            </button>

            <style>{`
                .bottom-nav {
                    display: none;
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: var(--bg-secondary);
                    border-top: 1px solid var(--border);
                    padding: 8px 0;
                    z-index: 1000;
                    justify-content: space-around;
                    align-items: center;
                    padding-bottom: env(safe-area-inset-bottom, 8px);
                }

                .nav-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 10px;
                    padding: 4px 12px;
                    width: 100%;
                }

                .nav-item.active {
                    color: var(--text-primary);
                }

                .nav-item svg {
                    width: 24px;
                    height: 24px;
                }

                .nav-avatar {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: var(--accent);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                }

                @media (max-width: 600px) {
                    .bottom-nav {
                        display: flex;
                    }
                    /* Add padding to body or main to prevent content being hidden behind nav */
                    .main-content {
                        padding-bottom: 60px; 
                    }
                }
            `}</style>
        </div>
    )
}

export default BottomNav
