import { useEffect } from 'react'
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Watch from './pages/Watch'
import Search from './pages/Search'
import Auth from './pages/Auth'
import History from './pages/History'
import Playlists from './pages/Playlists'
import PlaylistDetail from './pages/PlaylistDetail'
import Profile from './pages/Profile'
import Subscriptions from './pages/Subscriptions'
import Notifications from './pages/Notifications'
import { authApi } from './services/api'

function ProtectedRoute({ children }) {
    const location = useLocation()
    const user = authApi.getCurrentUser()

    if (!user) {
        return <Navigate to="/auth" replace state={{ from: location }} />
    }

    return children
}

function App() {
    const location = useLocation()
    const navigate = useNavigate()
    const isAuthPage = location.pathname === '/auth'

    useEffect(() => {
        const handleExpiredAuth = () => {
            if (location.pathname !== '/auth') {
                navigate('/auth', { replace: true, state: { from: location } })
            }
        }
        window.addEventListener('auth-expired', handleExpiredAuth)
        return () => window.removeEventListener('auth-expired', handleExpiredAuth)
    }, [location, navigate])

    return (
        <div className="app">
            {!isAuthPage && <Navbar />}
            <main className={isAuthPage ? 'auth-main' : 'main-content'}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/watch/:videoId" element={<Watch />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
                    <Route path="/playlists" element={<ProtectedRoute><Playlists /></ProtectedRoute>} />
                    <Route path="/playlists/:id" element={<ProtectedRoute><PlaylistDetail /></ProtectedRoute>} />
                    <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
                    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            {!isAuthPage && <BottomNav />}
        </div>
    )
}

export default App
