import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, subscriptionApi } from '../services/api'
import SearchDropdown from './SearchDropdown'
import { addSearchHistory } from '../utils/searchHistory'

function Navbar() {
    const [searchQuery, setSearchQuery] = useState('')
    const [user, setUser] = useState(authApi.getCurrentUser())
    const [notificationCount, setNotificationCount] = useState(0)
    const [showDropdown, setShowDropdown] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        const checkUser = () => {
            setUser(authApi.getCurrentUser())
        }

        checkUser()
        window.addEventListener('auth-change', checkUser)
        return () => window.removeEventListener('auth-change', checkUser)
    }, [])

    useEffect(() => {
        const fetchNotify = () => {
            if (user) {
                subscriptionApi.getNotifications()
                    .then(data => setNotificationCount(data.length))
                    .catch(err => console.error("Failed to fetch notifications", err))
            }
        }

        fetchNotify()
        window.addEventListener('notification-change', fetchNotify)
        // Also listen to auth-change to re-fetch
        window.addEventListener('auth-change', fetchNotify)

        return () => {
            window.removeEventListener('notification-change', fetchNotify)
            window.removeEventListener('auth-change', fetchNotify)
        }
    }, [user])

    const handleLogout = () => {
        authApi.logout()
        setUser(null)
        navigate('/')
    }

    const handleSearch = (e) => {
        e?.preventDefault()
        if (searchQuery.trim()) {
            performSearch(searchQuery.trim())
        }
    }

    const performSearch = (query) => {
        // Save to search history
        addSearchHistory(query)

        // Check if it's a YouTube URL or video ID
        const videoIdMatch = query.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:$|\?|&)/
        )

        setShowDropdown(false)

        if (videoIdMatch) {
            navigate(`/watch/${videoIdMatch[1]}`)
        } else {
            navigate(`/search?q=${encodeURIComponent(query)}`)
        }
    }

    const handleVoiceSearch = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('您的瀏覽器不支援語音搜尋')
            return
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()

        recognition.lang = 'zh-TW'
        recognition.continuous = false
        recognition.interimResults = false

        recognition.onstart = () => {
            setIsListening(true)
        }

        recognition.onend = () => {
            setIsListening(false)
        }

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript
            setSearchQuery(transcript)
            performSearch(transcript)
        }

        recognition.start()
    }

    const handleDropdownSelect = useCallback((text) => {
        setSearchQuery(text)
        performSearch(text)
    }, [navigate])

    const handleFillQuery = useCallback((text) => {
        setSearchQuery(text)
    }, [])

    const handleCloseDropdown = useCallback(() => {
        setShowDropdown(false)
    }, [])

    return (
        <nav className="navbar">
            <a href="/" className="navbar-logo" onClick={(e) => { e.preventDefault(); navigate('/') }}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
            </a>

            <div className="search-container" style={{ position: 'relative' }}>
                <form className="search-form" onSubmit={handleSearch}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="搜尋..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowDropdown(true)}
                    />
                    {searchQuery && showDropdown && (
                        <button
                            type="button"
                            className="search-clear-btn"
                            onClick={() => { setSearchQuery(''); }}
                            style={{
                                padding: '8px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer'
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                        </button>
                    )}
                    <button type="submit" className="search-button">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                        </svg>
                    </button>
                </form>

                <SearchDropdown
                    query={searchQuery}
                    isVisible={showDropdown}
                    onSelect={handleDropdownSelect}
                    onFillQuery={handleFillQuery}
                    onClose={handleCloseDropdown}
                />
            </div>

            <div className="navbar-spacer" style={{ flex: 1 }}></div> {/* Spacer */}

            {/* Mobile Mic Button (Replaces Notification) */}
            <button
                className={`mobile-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={handleVoiceSearch}
                title="語音搜尋"
            >
                <div className="mic-icon-wrapper">
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                    {isListening && <span className="mic-listening-indicator"></span>}
                </div>
            </button>

            <div className="navbar-actions">
                {user ? (
                    <div className="user-menu">
                        <button className="nav-link-btn" onClick={() => navigate('/notifications')} title="通知">
                            <span className="icon" style={{ position: 'relative' }}>
                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                                </svg>
                                {notificationCount > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-4px',
                                        right: '-4px',
                                        background: 'red',
                                        color: 'white',
                                        borderRadius: '50%',
                                        width: '18px',
                                        height: '18px',
                                        fontSize: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {notificationCount > 99 ? '99+' : notificationCount}
                                    </span>
                                )}
                            </span>
                            <span className="label">通知</span>
                        </button>
                        <button className="nav-link-btn" onClick={() => navigate('/subscriptions')} title="訂閱內容">
                            <span className="icon">
                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h9l-3-3zm9.54-1.5l-1.41-1.41-3.07 3.07-1.39-1.39-1.41 1.41 2.8 2.8 4.48-4.48z" />
                                </svg>
                            </span>
                            <span className="label">訂閱內容</span>
                        </button>
                        <button className="nav-link-btn" onClick={() => navigate('/history')} title="觀看紀錄">
                            <span className="icon">
                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                                </svg>
                            </span>
                            <span className="label">觀看紀錄</span>
                        </button>
                        <button className="nav-link-btn" onClick={() => navigate('/playlists')} title="我的播放清單">
                            <span className="icon">
                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                    <path d="M20 6h-16c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-12c0-1.1-.9-2-2-2zm0 14h-16v-12h16v12zm-2-16h-12v2h12v-2zm-4-4h-8v2h8v-2z" />
                                </svg>
                            </span>
                            <span className="label">播放清單</span>
                        </button>

                        <div className="user-profile">
                            <span className="username">{user.username}</span>
                        </div>
                        <button onClick={handleLogout} className="logout-btn">登出</button>
                    </div>
                ) : (
                    <button onClick={() => navigate('/auth')} className="auth-btn login-btn">
                        登入
                    </button>
                )}
            </div>

            <style>{`
                .auth-btn {
                    padding: 8px 20px;
                    border-radius: 20px;
                    border: 1px solid rgba(255,255,255,0.2);
                    background: transparent;
                    color: white;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
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
                    gap: 8px;
                }
                
                .nav-link-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: transparent;
                    border: none;
                    color: #fff;
                    padding: 8px 12px;
                    border-radius: 18px;
                    cursor: pointer;
                    transition: background 0.2s;
                    font-size: 0.9rem;
                }
                
                .nav-link-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                
                .nav-link-btn .icon {
                    font-size: 1.1rem;
                }

                .user-profile {
                    margin-left: 8px;
                    margin-right: 8px;
                    padding-left: 12px;
                    border-left: 1px solid rgba(255,255,255,0.2);
                }
                
                .username {
                    font-size: 14px;
                    font-weight: 600;
                }
                
                .logout-btn {
                    padding: 6px 12px;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.3);
                    color: #aaa;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    transition: all 0.2s;
                }
                
                .logout-btn:hover {
                    color: #fff;
                    border-color: #fff;
                }
                
                /* Make sure actions don't shrink */
                .navbar-actions {
                    flex-shrink: 0;
                    margin-left: 16px;
                }

                @media (max-width: 900px) {
                    .nav-link-btn .label {
                        display: none;
                    }
                    .nav-link-btn {
                        padding: 8px;
                    }
                    .user-profile {
                        display: none;
                    }
                }

                @media (max-width: 600px) {
                    .navbar {
                        padding: 0 8px; /* Reduce padding on mobile */
                        flex-wrap: nowrap; /* Force single line */
                        height: 56px; /* Enforce height */
                        gap: 8px;
                    }
                    .navbar-logo {
                        width: 32px; /* Smaller logo */
                        overflow: hidden;
                        margin-right: 0;
                        flex-shrink: 0;
                    }
                    .search-container {
                         /* On mobile, search bar takes available space */
                        flex: 1; 
                        min-width: 0; 
                        margin: 0; 
                        width: auto;
                        height: 40px;
                    }
                    .search-form {
                        height: 100%;
                    }
                    .search-input {
                        min-width: 0; /* Allow input to shrink */
                        padding: 0 12px;
                    }
                    .navbar-actions {
                         display: none; /* Hide top actions on mobile, use BottomNav */
                    }

                    .navbar-spacer {
                        display: none;
                    }

                    .mobile-mic-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: var(--bg-hover);
                        border: none;
                        color: white;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }
                    
                    .mobile-mic-btn.listening {
                        background: #cc0000;
                        animation: pulse 1.5s infinite;
                    }
                    
                    .mic-icon-wrapper {
                        position: relative;
                        display: flex;
                        align-items: center;
                    }
                    
                    .auth-btn {
                        padding: 6px 12px;
                        font-size: 13px;
                    }
                    .user-menu {
                        gap: 8px;
                    }
                }

                @media (min-width: 601px) {
                    .mobile-mic-btn {
                        display: none;
                    }
                }
                
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(204, 0, 0, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(204, 0, 0, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(204, 0, 0, 0); }
                }
            `}</style>
        </nav>
    )
}

export default Navbar
