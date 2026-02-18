import { useState, useEffect, useRef, useCallback } from 'react'
import { getSearchHistory, removeSearchHistory } from '../utils/searchHistory'
import { searchApi } from '../services/api'

function SearchDropdown({ query, isVisible, onSelect, onFillQuery, onClose }) {
    const [history, setHistory] = useState([])
    const [suggestions, setSuggestions] = useState([])
    const dropdownRef = useRef(null)
    const debounceRef = useRef(null)

    // Swipe state per item
    const [swipingIndex, setSwipingIndex] = useState(null)
    const [swipeOffset, setSwipeOffset] = useState(0)
    const touchStartX = useRef(0)
    const touchStartY = useRef(0)
    const isSwiping = useRef(false)

    // Load history
    useEffect(() => {
        if (isVisible) {
            setHistory(getSearchHistory())
        }
    }, [isVisible, query])

    // Fetch suggestions with debounce
    useEffect(() => {
        if (!isVisible) return

        if (debounceRef.current) clearTimeout(debounceRef.current)

        if (query && query.trim().length >= 1) {
            debounceRef.current = setTimeout(async () => {
                try {
                    const results = await searchApi.getSuggestions(query.trim())
                    setSuggestions(results || [])
                } catch {
                    setSuggestions([])
                }
            }, 300)
        } else {
            setSuggestions([])
        }

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [query, isVisible])

    // Click outside to close
    useEffect(() => {
        if (!isVisible) return

        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                // Check if click is on the search form itself
                const searchForm = document.querySelector('.search-form')
                if (searchForm && searchForm.contains(e.target)) return
                onClose()
            }
        }

        // Delay to avoid immediate close on focus
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
            document.addEventListener('touchstart', handleClickOutside)
        }, 100)

        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('touchstart', handleClickOutside)
        }
    }, [isVisible, onClose])

    // Filter history by query
    const filteredHistory = query.trim()
        ? history.filter(item =>
            item.query.toLowerCase().includes(query.trim().toLowerCase())
        )
        : history

    // Filter suggestions to exclude items already in history
    const historyQueries = new Set(filteredHistory.map(h => h.query.toLowerCase()))
    const filteredSuggestions = suggestions.filter(s => !historyQueries.has(s.toLowerCase()))

    // Delete history item
    const handleDelete = useCallback((queryToDelete, e) => {
        e?.stopPropagation()
        removeSearchHistory(queryToDelete)
        setHistory(getSearchHistory())
        setSwipingIndex(null)
        setSwipeOffset(0)
    }, [])

    // Touch handlers for swipe-to-delete
    const handleTouchStart = (e, index) => {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
        isSwiping.current = false
        setSwipingIndex(index)
        setSwipeOffset(0)
    }

    const handleTouchMove = (e, index) => {
        if (swipingIndex !== index) return

        const deltaX = e.touches[0].clientX - touchStartX.current
        const deltaY = e.touches[0].clientY - touchStartY.current

        // Determine if horizontal swipe
        if (!isSwiping.current && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
            isSwiping.current = true
        }

        if (isSwiping.current) {
            e.preventDefault()
            // Only allow left swipe (negative)
            const offset = Math.min(0, deltaX)
            setSwipeOffset(offset)
        }
    }

    const handleTouchEnd = (index) => {
        if (swipingIndex !== index) return

        // If swiped enough, keep the delete button visible
        if (swipeOffset < -80) {
            setSwipeOffset(-80)
        } else {
            setSwipeOffset(0)
            setSwipingIndex(null)
        }
    }

    if (!isVisible) return null

    const hasContent = filteredHistory.length > 0 || filteredSuggestions.length > 0

    if (!hasContent && !query.trim()) return null

    return (
        <div className="search-dropdown" ref={dropdownRef}>
            {/* History Items */}
            {filteredHistory.map((item, index) => (
                <div
                    key={`h-${item.query}`}
                    className="dropdown-item-wrapper"
                >
                    <div
                        className="dropdown-item history-item"
                        style={{
                            transform: swipingIndex === index ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                            transition: swipingIndex === index && isSwiping.current ? 'none' : 'transform 0.3s ease'
                        }}
                        onClick={() => onSelect(item.query)}
                        onTouchStart={(e) => handleTouchStart(e, index)}
                        onTouchMove={(e) => handleTouchMove(e, index)}
                        onTouchEnd={() => handleTouchEnd(index)}
                    >
                        <div className="dropdown-item-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                            </svg>
                        </div>
                        <span className="dropdown-item-text">{item.query}</span>
                        {item.thumbnail && (
                            <img
                                className="dropdown-item-thumb"
                                src={item.thumbnail}
                                alt=""
                                loading="lazy"
                            />
                        )}
                        <button
                            className="dropdown-item-fill"
                            onClick={(e) => {
                                e.stopPropagation()
                                onFillQuery(item.query)
                            }}
                            title="填入搜尋框"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                            </svg>
                        </button>
                    </div>
                    {/* Delete button revealed by swipe */}
                    <button
                        className="dropdown-item-delete"
                        onClick={(e) => handleDelete(item.query, e)}
                        style={{
                            opacity: swipingIndex === index && swipeOffset < -30 ? 1 : 0,
                            pointerEvents: swipingIndex === index && swipeOffset < -30 ? 'auto' : 'none'
                        }}
                    >
                        刪除
                    </button>
                </div>
            ))}

            {/* Divider */}
            {filteredHistory.length > 0 && filteredSuggestions.length > 0 && (
                <div className="dropdown-divider" />
            )}

            {/* Suggestion Items */}
            {filteredSuggestions.slice(0, 8).map((suggestion) => (
                <div
                    key={`s-${suggestion}`}
                    className="dropdown-item suggestion-item"
                    onClick={() => onSelect(suggestion)}
                >
                    <div className="dropdown-item-icon suggestion-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                        </svg>
                    </div>
                    <span className="dropdown-item-text">{suggestion}</span>
                    <button
                        className="dropdown-item-fill"
                        onClick={(e) => {
                            e.stopPropagation()
                            onFillQuery(suggestion)
                        }}
                        title="填入搜尋框"
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                        </svg>
                    </button>
                </div>
            ))}

            {/* No results hint */}
            {query.trim() && filteredHistory.length === 0 && filteredSuggestions.length === 0 && (
                <div className="dropdown-empty">
                    沒有符合的紀錄或建議
                </div>
            )}

            <style>{`
                .search-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: var(--bg-secondary, #1a1a1a);
                    border: 1px solid var(--border, #3d3d3d);
                    border-top: none;
                    border-radius: 0 0 12px 12px;
                    max-height: 70vh;
                    overflow-y: auto;
                    overflow-x: hidden;
                    z-index: 200;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    -webkit-overflow-scrolling: touch;
                }

                .dropdown-item-wrapper {
                    position: relative;
                    overflow: hidden;
                }

                .dropdown-item {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    cursor: pointer;
                    transition: background 0.15s;
                    gap: 12px;
                    position: relative;
                    z-index: 1;
                    background: var(--bg-secondary, #1a1a1a);
                }

                .dropdown-item:hover {
                    background: var(--bg-tertiary, #272727);
                }

                .dropdown-item:active {
                    background: var(--bg-hover, #3d3d3d);
                }

                .dropdown-item-icon {
                    color: var(--text-secondary, #aaa);
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                }

                .suggestion-icon {
                    color: var(--text-muted, #717171);
                }

                .dropdown-item-text {
                    flex: 1;
                    font-size: 0.95rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: var(--text-primary, #f1f1f1);
                }

                .dropdown-item-thumb {
                    width: 56px;
                    height: 32px;
                    object-fit: cover;
                    border-radius: 4px;
                    flex-shrink: 0;
                }

                .dropdown-item-fill {
                    color: var(--text-secondary, #aaa);
                    padding: 8px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: background 0.15s;
                }

                .dropdown-item-fill:hover {
                    background: rgba(255,255,255,0.1);
                }

                .dropdown-item-delete {
                    position: absolute;
                    right: 0;
                    top: 0;
                    bottom: 0;
                    width: 80px;
                    background: #e53935;
                    color: white;
                    font-weight: 600;
                    font-size: 0.9rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 0;
                    transition: opacity 0.2s;
                    cursor: pointer;
                    border: none;
                }

                .dropdown-divider {
                    height: 1px;
                    background: var(--border, #3d3d3d);
                    margin: 4px 0;
                }

                .dropdown-empty {
                    padding: 16px;
                    text-align: center;
                    color: var(--text-muted, #717171);
                    font-size: 0.9rem;
                }

                @media (max-width: 600px) {
                    .search-dropdown {
                        position: fixed;
                        top: 56px; /* Exactly matches navbar height — no gap */
                        left: 0;
                        right: 0;
                        border-radius: 0 0 12px 12px;
                        max-height: 70vh;
                        border: 1px solid var(--border, #3d3d3d);
                        border-top: none;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                    }
                }
            `}</style>
        </div>
    )
}

export default SearchDropdown
