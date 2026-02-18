const STORAGE_KEY = 'search_history'
const MAX_ITEMS = 20

export function getSearchHistory() {
    try {
        const data = localStorage.getItem(STORAGE_KEY)
        return data ? JSON.parse(data) : []
    } catch {
        return []
    }
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

export function updateSearchHistoryThumbnail(query, thumbnail) {
    if (!query || !thumbnail) return
    const history = getSearchHistory()
    const item = history.find(h => h.query === query.trim())
    if (item) {
        item.thumbnail = thumbnail
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    }
}
