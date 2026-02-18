import { Routes, Route } from 'react-router-dom'
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

function App() {
    return (
        <div className="app">
            <Navbar />
            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/watch/:videoId" element={<Watch />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/playlists" element={<Playlists />} />
                    <Route path="/playlists/:id" element={<PlaylistDetail />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/profile" element={<Profile />} />
                </Routes>
            </main>
            <BottomNav />
        </div>
    )
}

export default App
