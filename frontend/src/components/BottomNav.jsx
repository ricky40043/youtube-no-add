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
                <svg viewBox="0 0 24 24">
                    <path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z" />
                </svg>
                <span className="label">首頁</span>
            </Link>

            <Link to="/subscriptions" className={`nav-item ${location.pathname === '/subscriptions' ? 'active' : ''}`}>
                <svg viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h9l-3-3zm9.54-1.5l-1.41-1.41-3.07 3.07-1.39-1.39-1.41 1.41 2.8 2.8 4.48-4.48z" />
                </svg>
                <span className="label">訂閱</span>
            </Link>

            <Link to="/playlists" className={`nav-item ${location.pathname.startsWith('/playlists') ? 'active' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><g fill="none"><path d="M3 9h18l-1.8 12H4.8z"/><path d="m13.5 15l-2 1.5v-3z"/><path stroke="currentColor" strokeLinecap="square" strokeWidth="2" d="M5 6h14M7 3h10M3 9h18l-1.8 12H4.8z"/><path stroke="currentColor" strokeWidth="2" d="m13.5 15l-2 1.5v-3z"/></g></svg>
                <span className="label">影片清單</span>
            </Link>

            <Link to="/history" className={`nav-item ${location.pathname === '/history' ? 'active' : ''}`}>
                <svg viewBox="0 0 24 24">
                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                </svg>
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
                    <div className="nav-avatar" style={{ background: 'transparent', border: '1px solid currentColor', color: 'currentColor' }}>
                        <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px' }}>
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                        </svg>
                    </div>
                )}
                <span>{user ? user.username : '登入'}</span>
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
                    height: 60px; /* Fixed height to ensure consistent layout */
                }

                .nav-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 10px;
                    padding: 4px 0;
                    width: 100%;
                    flex: 1; /* Distribute space evenly */
                }

                .nav-item.active {
                    color: var(--text-primary);
                }

                .nav-item svg {
                    width: 28px; /* Enlarge icons */
                    height: 28px;
                    fill: currentColor;
                }

                /* Fixed line box so the Latin username label and the CJK
                   labels occupy the same height and stay on one baseline. */
                .nav-item > span {
                    line-height: 14px;
                }

                .nav-avatar {
                    /* Match .nav-item svg size so the profile label lines up
                       with the other nav labels instead of sitting lower. */
                    width: 28px;
                    height: 28px;
                    flex-shrink: 0;
                    border-radius: 50%;
                    background: var(--accent);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: bold;
                }

                @media (max-width: 600px) {
                    .bottom-nav {
                        display: flex;
                    }
                    /* Add padding to body or main to prevent content being hidden behind nav */
                    .main-content {
                        padding-bottom: 70px; 
                    }
                }
            `}</style>
        </div>
    )
}

export default BottomNav
