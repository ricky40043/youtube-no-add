import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'

function Navbar() {
    const [searchQuery, setSearchQuery] = useState('')
    const [user, setUser] = useState(authApi.getCurrentUser())
    const navigate = useNavigate()

    // Check user status on mount (simple implementation)
    useEffect(() => {
        setUser(authApi.getCurrentUser())
    }, [])

    const handleLogout = () => {
        authApi.logout()
        setUser(null)
        navigate('/')
    }

    const handleSearch = (e) => {
        e.preventDefault()
        if (searchQuery.trim()) {
            // Check if it's a YouTube URL or video ID
            const videoIdMatch = searchQuery.match(
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:$|\?|&)/
            )

            if (videoIdMatch) {
                navigate(`/watch/${videoIdMatch[1]}`)
            } else {
                navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
            }
        }
    }

    return (
        <nav className="navbar">
            <a href="/" className="navbar-logo" onClick={(e) => { e.preventDefault(); navigate('/') }}>
                <svg viewBox="0 0 90 20" fill="currentColor">
                    <path d="M27.973 6.304c-.297-1.117-1.17-1.998-2.28-2.296C23.655 3.5 15 3.5 15 3.5s-8.655 0-10.693.508c-1.11.298-1.983 1.18-2.28 2.296C1.5 8.357 1.5 12.64 1.5 12.64s0 4.283.527 6.336c.297 1.117 1.17 1.997 2.28 2.296C6.345 21.78 15 21.78 15 21.78s8.655 0 10.693-.508c1.11-.3 1.983-1.18 2.28-2.296.527-2.053.527-6.336.527-6.336s0-4.283-.527-6.336zM12.378 16.203v-7.126l7.144 3.563-7.144 3.563z" />
                </svg>
            </a>

            <div className="search-container">
                <form className="search-form" onSubmit={handleSearch}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="搜尋..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="submit" className="search-button">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                        </svg>
                    </button>
                </form>
            </div>

            <div className="navbar-actions">
                {user ? (
                    <div className="user-menu">
                        <span className="username" onClick={() => navigate('/history')} style={{ cursor: 'pointer' }} title="History">🕒</span>
                        <span className="username" onClick={() => navigate('/playlists')} style={{ cursor: 'pointer' }} title="Playlists">📂</span>
                        <span className="username">{user.username}</span>
                        <button onClick={handleLogout} className="auth-btn">Logout</button>
                    </div>
                ) : (
                    <button onClick={() => navigate('/auth')} className="auth-btn login-btn">
                        Login
                    </button>
                )}
            </div>

            <style>{`
                .auth-btn {
                    padding: 8px 16px;
                    border-radius: 20px;
                    border: 1px solid rgba(255,255,255,0.2);
                    background: transparent;
                    color: white;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                
                .auth-btn:hover {
                    background: rgba(255,255,255,0.1);
                    border-color: white;
                }
                
                .login-btn {
                    background: var(--accent-color);
                    border: none;
                }
                
                .login-btn:hover {
                    background: #cc0000;
                }
                
                .user-menu {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .username {
                    font-size: 14px;
                    font-weight: bold;
                }
                
                /* Make sure actions don't shrink */
                .navbar-actions {
                    flex-shrink: 0;
                    margin-left: 8px;
                }

                @media (max-width: 600px) {
                    .navbar {
                        padding: 0 8px; /* Reduce padding on mobile */
                        flex-wrap: nowrap; /* Force single line */
                    }
                    .navbar-logo {
                        width: 32px; /* Minimal logo size */
                        overflow: hidden;
                        margin-right: 4px; /* Reduced margin */
                        flex-shrink: 0;
                    }
                    .search-container {
                        flex: 1; /* Allow search to take remaining space */
                        min-width: 0; /* Important for flex items to shrink */
                        margin: 0 4px; /* Minimal margin */
                        width: auto;
                    }
                    .search-input {
                        min-width: 0; /* Allow input to shrink */
                    }
                    .navbar-actions {
                        display: none; /* Hide top actions on mobile, use BottomNav */
                    }
                    .auth-btn {
                        padding: 6px 12px;
                        font-size: 13px;
                    }
                    .user-menu {
                        gap: 8px;
                    }
                }
            `}</style>
        </nav>
    )
}

export default Navbar
