const STORAGE_KEY = 'search_history'
const WATCH_HISTORY_KEY = 'local_watch_history'  // For non-logged-in users
const MAX_ITEMS = 20

export function getSearchHistory() {
    try {
        const data = localStorage.getItem(STORAGE_KEY)
        return data ? JSON.parse(data) : []
    } catch {
        return []
    }
}

export function getRecentSearchQueries(limit = 5) {
    const history = getSearchHistory();
    return history.slice(0, limit).map(item => item.query);
}

// Get watched videos for non-logged in users (stored locally)
export function getLocalWatchHistory() {
    try {
        const data = localStorage.getItem(WATCH_HISTORY_KEY)
        return data ? JSON.parse(data) : []
    } catch {
        return []
    }
}

// Add to local watch history when watching videos
export function addLocalWatchHistory(videoId, title, thumbnail) {
    if (!title) return
    
    let history = getLocalWatchHistory()
    
    // Remove duplicate
    history = history.filter(item => item.videoId !== videoId)
    
    // Add to top
    history.unshift({
        videoId,
        title,
        thumbnail: thumbnail || null,
        timestamp: Date.now()
    })
    
    // Limit to 50 items
    if (history.length > 50) {
        history = history.slice(0, 50)
    }
    
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history))
}

// Get recent watch history titles for recommendations
export function getRecentWatchTitles(limit = 10) {
    const history = getLocalWatchHistory()
    return history.slice(0, limit).map(item => item.title)
}

export function addSearchHistory(query, thumbnail = null) {
    if (!query || !query.trim()) return

    const trimmed = query.trim()
    let history = getSearchHistory()

    // Remove duplicate
    history = history.filter(item => item.query !== trimmed)

    // Add to top
    history.unshift({
        query: trimmed,
        thumbnail: thumbnail || null,
        timestamp: Date.now()
    })

    // Limit
    if (history.length > MAX_ITEMS) {
        history = history.slice(0, MAX_ITEMS)
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function removeSearchHistory(query) {
    let history = getSearchHistory()
    history = history.filter(item => item.query !== query)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function clearSearchHistory() {
    localStorage.removeItem(STORAGE_KEY)
}

export function updateSearchHistoryThumbnail(query, thumbnail) {
    if (!query || !thumbnail) return
    const history = getSearchHistory()
    const item = history.find(h => h.query === query.trim())
    if (item) {
        item.thumbnail = thumbnail
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    }
}
