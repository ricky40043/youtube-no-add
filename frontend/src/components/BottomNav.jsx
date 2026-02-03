import { useNavigate, useLocation } from 'react-router-dom'
import { authApi } from '../services/api'

function BottomNav() {
    const navigate = useNavigate()
    const location = useLocation()
    const user = authApi.getCurrentUser()

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
            <button
                className={`nav-item ${isActive('/') ? 'active' : ''}`}
                onClick={() => navigate('/')}
            >
                <svg viewBox="0 0 24 24" fill={isActive('/') ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span>Home</span>
            </button>

            <button
                className={`nav-item ${isActive('/playlists') ? 'active' : ''}`}
                onClick={() => navigate('/playlists')}
            >
                <svg viewBox="0 0 24 24" fill={isActive('/playlists') ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Library</span>
            </button>

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
                <span>You</span>
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
