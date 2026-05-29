import axios from 'axios'

// Use relative path to leverage Vite Proxy (configured in vite.config.js)
// This avoids CORS issues and firewall blocks on port 8000
const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
    baseURL: API_URL,
    timeout: 30000,
})

export const videoApi = {
    // Get video information
    getInfo: async (videoId) => {
        const response = await api.get(`/api/video/info/${encodeURIComponent(videoId)}`)
        return response.data
    },

    // Get audio stream URL for background playback
    getAudioUrl: async (videoId) => {
        const response = await api.get(`/api/video/audio/${encodeURIComponent(videoId)}`)
        return response.data.url
    },

    // Get stream URL (redirects to actual stream)
    getStreamUrl: (videoId, quality = 'audio') => {
        return `${API_URL}/api/video/stream/${encodeURIComponent(videoId)}?quality=${quality}`
    },

    // Get related videos
    getRelated: async (videoId, limit = 20, offset = 0) => {
        const response = await api.get(`/api/video/related/${encodeURIComponent(videoId)}`, {
            params: { limit, offset }
        })
        return response.data
    },
}

export const searchApi = {
    // Search videos
    search: async (query, maxResults = 20, offset = 0, sort = 'relevance') => {
        const response = await api.get('/api/search', {
            params: { q: query, max_results: maxResults, offset, sort }
        })
        return response.data.results
    },

    // Get trending videos
    getTrending: async (region = 'TW') => {
        const response = await api.get('/api/search/trending', {
            params: { region }
        })
        return response.data.results
    },

    // Get search suggestions
    getSuggestions: async (query) => {
        const response = await api.get('/api/search/suggestions', {
            params: { q: query }
        })
        return response.data.suggestions
    },

    // Get search related recommendations
    getRelated: async (query, limit = 10, offset = 0) => {
        const response = await api.get('/api/search/related', {
            params: { q: query, limit, offset }
        })
        return response.data.results
    },
}

export const searchHistoryApi = {
    get: async (limit = 20) => {
        const response = await api.get('/api/search-history', {
            params: { limit }
        })
        return response.data
    },
    add: async (query) => {
        const response = await api.post('/api/search-history', null, {
            params: { query }
        })
        return response.data
    },
    delete: async (historyId) => {
        const response = await api.delete(`/api/search-history/${historyId}`)
        return response.data
    },
    clear: async () => {
        const response = await api.delete('/api/search-history')
        return response.data
    },
}

export const historyApi = {
    get: async (userId) => {
        const response = await api.get('/api/history/', { params: { user_id: userId } })
        return response.data
    },
    add: async (data) => {
        // data: { user_id, video_id, title, thumbnail, progress_seconds }
        const response = await api.post('/api/history/', data)
        return response.data
    },
    deleteItem: async (userId, videoId) => {
        const response = await api.delete(`/api/history/${userId}/${encodeURIComponent(videoId)}`)
        return response.data
    },
    clearAll: async (userId) => {
        const response = await api.delete(`/api/history/${userId}/clear`)
        return response.data
    }
}

export const playlistApi = {
    getAll: async (userId) => {
        const response = await api.get('/api/playlists/', { params: { user_id: userId } })
        return response.data
    },
    create: async (data) => {
        // data: { title, description, user_id }
        const response = await api.post('/api/playlists/', data)
        return response.data
    },
    getItems: async (playlistId) => {
        const response = await api.get(`/api/playlists/${playlistId}/items`)
        return response.data
    },
    addItem: async (playlistId, item) => {
        // item: { video_id, title, thumbnail, duration, position }
        const response = await api.post(`/api/playlists/${playlistId}/items`, item)
        return response.data
    },
    delete: async (playlistId) => {
        const response = await api.delete(`/api/playlists/${playlistId}`)
        return response.data
    },
    update: async (playlistId, data) => {
        // data: { title, description }
        const response = await api.put(`/api/playlists/${playlistId}`, data)
        return response.data
    },
    import: async (data) => {
        // data: { url, user_id }
        const response = await api.post('/api/playlists/import', data)
        return response.data
    }
}





export const subscriptionApi = {
    getAll: async () => {
        const response = await api.get('/api/subscriptions/')
        return response.data
    },
    checkStatus: async (channelId) => {
        const response = await api.get(`/api/subscriptions/status/${encodeURIComponent(channelId)}`)
        return response.data
    },
    subscribe: async (data) => {
        // data: { channel_id, channel_name, channel_thumbnail }
        const response = await api.post('/api/subscriptions/', data)
        return response.data
    },
    unsubscribe: async (channelId) => {
        const response = await api.delete(`/api/subscriptions/${encodeURIComponent(channelId)}`)
        return response.data
    },
    getFeed: async () => {
        const response = await api.get('/api/subscriptions/feed')
        return response.data
    },
    toggleNotification: async (channelId, enable = null) => {
        const params = enable !== null ? `?enable=${enable}` : ''
        const response = await api.put(`/api/subscriptions/${encodeURIComponent(channelId)}/notify${params}`)
        window.dispatchEvent(new Event('notification-change'))
        return response.data
    },
    getNotifications: async () => {
        const response = await api.get('/api/subscriptions/notifications')
        return response.data
    }
}

// Feed / Recommendation API
export const feedApi = {
    getFeed: async (cursor, limit = 20) => {
        const params = { cursor, limit }
        const response = await api.get('/api/feed/', { params })
        return response.data
    },
    sync: async () => {
        const response = await api.post('/api/feed/sync')
        return response.data
    },
    refreshProfile: async () => {
        const response = await api.post('/api/feed/refresh-profile')
        return response.data
    }
}

// Auth API for User System
export const authApi = {
    login: async (username, password) => {
        const formData = new URLSearchParams()
        formData.append('username', username)
        formData.append('password', password)
        // Note: For real OAuth2 we use x-www-form-urlencoded usually, but our simple API uses JSON for now?
        // Let's actually match the router we wrote: UserLogin(BaseModel) -> JSON
        const response = await api.post('/api/user/login', { username, password })
        if (response.data.access_token) {
            localStorage.setItem('token', response.data.access_token)
            localStorage.setItem('username', username)
            if (response.data.user_id) {
                localStorage.setItem('userId', response.data.user_id)
            }
            window.dispatchEvent(new Event('auth-change'))
        }
        return response.data
    },

    register: async (username, password) => {
        const response = await api.post('/api/user/register', { username, password })
        return response.data
    },

    logout: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        localStorage.removeItem('userId')
        window.dispatchEvent(new Event('auth-change'))
    },

    getCurrentUser: () => {
        const token = localStorage.getItem('token')
        const username = localStorage.getItem('username')
        const userId = localStorage.getItem('userId')
        
        if (!token || !userId) {
            return null  // Not logged in
        }
        return {
            username,
            token,
            id: parseInt(userId)
        }
    }
}

export const downloadApi = {
    start: async (videoId, type, title) => {
        const response = await api.post('/api/download/start', { video_id: videoId, type, title })
        return response.data
    },
    status: async (jobId) => {
        const response = await api.get(`/api/download/status/${jobId}`)
        return response.data
    },
    fileUrl: (jobId) => `${API_URL}/api/download/file/${jobId}`,
}

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

export default api
