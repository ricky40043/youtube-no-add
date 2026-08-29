import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { formatTimeAgo } from '../utils/date'
import { addLocalWatchHistory } from '../utils/searchHistory'
import VideoPlayer from '../components/VideoPlayer'
import VideoCard from '../components/VideoCard'
import AddToPlaylistModal from '../components/AddToPlaylistModal'
import { videoApi, historyApi, authApi, playlistApi, subscriptionApi, downloadApi } from '../services/api'
import YouTube from 'react-youtube'
import useIsMobile from '../hooks/useIsMobile'

function Watch() {
    const { videoId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const searchParams = new URLSearchParams(location.search)
    const playlistId = searchParams.get('list')
    const initialIndex = parseInt(searchParams.get('index') || '0')

    const [videoInfo, setVideoInfo] = useState(null)
    const [audioUrl, setAudioUrl] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [playlistError, setPlaylistError] = useState(null) // New error state
    const [showPlaylistModal, setShowPlaylistModal] = useState(false)
    const [showDownloadModal, setShowDownloadModal] = useState(false)
    const [downloadJob, setDownloadJob] = useState(null) // { jobId, type, status, progress, message }
    const downloadPollRef = useRef(null)

    // Feature B: Persist Player Mode (default to Embed)
    const [useEmbed, setUseEmbed] = useState(() => localStorage.getItem('playerMode') !== 'proxy')
    const [loopMode, setLoopMode] = useState(() => localStorage.getItem('loopMode') === 'true')
    const [embedError, setEmbedError] = useState(false)
    const [savedTime, setSavedTime] = useState(0)
    const youtubePlayerRef = useRef(null)
    const videoTimeRef = useRef(0)
    const lastVideoIdRef = useRef(null)
    const [isMiniPlayer, setIsMiniPlayer] = useState(false)
    const [isPlayerClosed, setIsPlayerClosed] = useState(false)
    const horizontalTouchRef = useRef({ x: 0, y: 0, active: false })
    const horizontalBackRef = useRef(false)
    
    // Feature: Hide background playback buttons on desktop
    const isMobile = useIsMobile(1024)

    // Keep horizontal page swipes from being interpreted as browser history
    // navigation. Player gestures are deliberately excluded: the player owns
    // seeking, double-tap and long-press interactions.
    useEffect(() => {
        const handleTouchStart = (event) => {
            if (event.target.closest?.('.player-container, .video-container')) return
            const touch = event.touches[0]
            horizontalTouchRef.current = { x: touch.clientX, y: touch.clientY, active: true }
        }
        const handleTouchMove = (event) => {
            const start = horizontalTouchRef.current
            if (!start.active || event.target.closest?.('.player-container, .video-container')) return
            const touch = event.touches[0]
            const dx = touch.clientX - start.x
            const dy = touch.clientY - start.y
            if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                event.preventDefault()
                event.stopPropagation()
            }
        }
        const handleTouchEnd = (event) => {
            const start = horizontalTouchRef.current
            if (start.active && !event.target.closest?.('.player-container, .video-container')) {
                const touch = event.changedTouches[0]
                const dx = touch.clientX - start.x
                const dy = touch.clientY - start.y
                if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                    event.preventDefault()
                    event.stopPropagation()
                    horizontalBackRef.current = true
                    window.setTimeout(() => { horizontalBackRef.current = false }, 700)
                }
            }
            horizontalTouchRef.current.active = false
        }
        const handlePopState = (event) => {
            if (!horizontalBackRef.current) return
            // Safari/Android may dispatch popstate after an edge-swipe even
            // when the touch event was cancelled. Restore the current entry
            // and stop the router from navigating away from Watch.
            event.stopImmediatePropagation?.()
            horizontalBackRef.current = false
            window.history.forward()
        }
        document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true })
        document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
        document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true })
        window.addEventListener('popstate', handlePopState, true)
        return () => {
            document.removeEventListener('touchstart', handleTouchStart, true)
            document.removeEventListener('touchmove', handleTouchMove, true)
            document.removeEventListener('touchend', handleTouchEnd, true)
            window.removeEventListener('popstate', handlePopState, true)
        }
    }, [])

    useEffect(() => {
        // A new route always starts as a normal player; this also prevents a
        // floating player from accidentally showing the previous video's UI.
        setIsMiniPlayer(false)
        setIsPlayerClosed(false)
    }, [videoId])

    const handleToggleMiniPlayer = async () => {
        if (!isMiniPlayer && !useEmbed) {
            const video = document.querySelector('.watch-page .player-container video')
            if (video?.requestPictureInPicture && !document.pictureInPictureElement) {
                try {
                    await video.requestPictureInPicture()
                    setIsMiniPlayer(true)
                    if (window.history.length > 1) navigate(-1)
                    return
                } catch (err) {
                    console.warn('[Watch] Picture-in-Picture unavailable, using mini player:', err)
                }
            }
        }
        setIsMiniPlayer(prev => !prev)
    }

    // Feature: Video history stack for "Go Back" functionality
    const [videoHistory, setVideoHistory] = useState(() => {
        const saved = localStorage.getItem('videoHistory')
        return saved ? JSON.parse(saved) : []
    })

    // Mobile browser back gesture. Keep it on the page shell so it does not
    // interfere with the player's timeline/controls.
    const swipeStartRef = useRef(null)
    const handleWatchTouchStart = useCallback((event) => {
        const touch = event.touches[0]
        if (!touch) return
        if (event.target.closest?.('.player-controls, button, input, select')) {
            swipeStartRef.current = null
            return
        }
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY }
    }, [])

    const handleWatchTouchEnd = useCallback((event) => {
        const start = swipeStartRef.current
        swipeStartRef.current = null
        const touch = event.changedTouches[0]
        if (!start || !touch || !isMobile) return

        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y
        if (Math.abs(dx) >= 80 && Math.abs(dy) < 60) {
            navigate(-1)
        }
    }, [isMobile, navigate])

    const onPlayerReady = (event) => {
        youtubePlayerRef.current = event.target
    }

    const onPlayerError = (e) => {
        console.error('YouTube Player Error:', e.data)
        setEmbedError(true)
    }

    const onPlayerStateChange = (e) => {
        // If playing (1) or buffering (3), clear error
        if (e.data === 1 || e.data === 3) {
            setEmbedError(false)
        }
        // If video ended (0), auto-play related videos
        if (e.data === 0) {
            console.log('[Watch] YouTube video ended, triggering handleVideoEnd')
            handleVideoEnd()
        }
    }

    const embedOpts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            start: Math.floor(savedTime),
        },
    }

    // Playlist state
    const [playlistItems, setPlaylistItems] = useState([])
    const [playlistTitle, setPlaylistTitle] = useState('')
    const [currentIndex, setCurrentIndex] = useState(initialIndex)
    const [isShuffle, setIsShuffle] = useState(false)
    const [shuffledIndices, setShuffledIndices] = useState([])

    // Related videos state (for auto-play when no playlist)
    const [relatedVideos, setRelatedVideos] = useState([])
    const [loadingRelated, setLoadingRelated] = useState(false)
    const [relatedOffset, setRelatedOffset] = useState(0)
    const [relatedHasMore, setRelatedHasMore] = useState(true)

    // Load more related videos
    const loadMoreRelatedVideos = useCallback(async () => {
        console.log('[Watch] loadMoreRelatedVideos called, videoId:', videoId, 'playlistId:', playlistId, 'loading:', loadingRelated, 'hasMore:', relatedHasMore)
        if (!videoId || playlistId || loadingRelated || !relatedHasMore) {
            console.log('[Watch] loadMoreRelatedVideos early return')
            return
        }
        
        setLoadingRelated(true)
        try {
            const data = await videoApi.getRelated(videoId, 20, relatedOffset)
            console.log('[Watch] Related API returned:', data)
            
            // Handle both array and object formats
            let items = []
            if (Array.isArray(data)) {
                items = data
            } else if (data && Array.isArray(data.items)) {
                items = data.items
            }
            
            if (relatedOffset === 0) {
                setRelatedVideos(items)
            } else {
                setRelatedVideos(prev => [...prev, ...items])
            }
            
            // Handle pagination
            if (data && typeof data === 'object' && 'next_offset' in data) {
                setRelatedHasMore(data.next_offset !== null)
                setRelatedOffset(data.next_offset || relatedOffset + 20)
            } else {
                // API returns all at once, no more after first load
                setRelatedHasMore(false)
            }
        } catch (err) {
            console.error('[Watch] Failed to load related videos', err)
        } finally {
            setLoadingRelated(false)
        }
    }, [videoId, playlistId, loadingRelated, relatedHasMore, relatedOffset])

    // Refresh related videos (reset and load)
    const refreshRelatedVideos = useCallback(() => {
        if (!videoId || playlistId) return
        setRelatedOffset(0)
        setRelatedHasMore(true)
        loadMoreRelatedVideos()
    }, [videoId, playlistId, loadMoreRelatedVideos])

    // Reset AND reload related videos when videoId changes
    useEffect(() => {
        console.log('[Watch] Video changed, resetting related videos for:', videoId)
        setRelatedVideos([])
        setRelatedOffset(0)
        setRelatedHasMore(true)
        
        // Load new related videos for the new video directly
        if (videoId && !playlistId) {
            console.log('[Watch] Loading related videos for:', videoId)
            setLoadingRelated(true)
            videoApi.getRelated(videoId, 20, 0)
                .then(data => {
                    console.log('[Watch] Related API returned:', data)
                    let items = []
                    if (Array.isArray(data)) {
                        items = data
                    } else if (data && Array.isArray(data.items)) {
                        items = data.items
                    }
                    // Filter out invalid videos (check for id)
                    items = items.filter(item => item && item.id)
                    console.log('[Watch] Valid related videos:', items.length)
                    setRelatedVideos(items)
                    setRelatedHasMore(false) // No pagination
                })
                .catch(err => {
                    console.error('[Watch] Failed to load related videos', err)
                })
                .finally(() => {
                    setLoadingRelated(false)
                })
        }
    }, [videoId, playlistId])

    // Subscription State
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [notifyEnabled, setNotifyEnabled] = useState(false)

    // Check subscription status
    useEffect(() => {
        if (!videoInfo?.channel_id || !authApi.getCurrentUser()) {
            setIsSubscribed(false)
            return
        }

        subscriptionApi.checkStatus(videoInfo.channel_id)
            .then(res => {
                setIsSubscribed(res.is_subscribed)
                setNotifyEnabled(res.notify_enabled)
            })
            .catch(err => console.error("Failed to check subscription:", err))
    }, [videoInfo])

    // Handle Subscribe
    const handleSubscribe = async () => {
        const user = authApi.getCurrentUser()
        if (!user) {
            navigate('/auth')
            return
        }

        try {
            if (isSubscribed) {
                await subscriptionApi.unsubscribe(videoInfo.channel_id)
                setIsSubscribed(false)
            } else {
                await subscriptionApi.subscribe({
                    channel_id: videoInfo.channel_id,
                    channel_name: videoInfo.author,
                    channel_thumbnail: videoInfo.author_thumbnail
                })
                setIsSubscribed(true)

                // Auto-sync feed
                import('../services/api').then(({ feedApi }) => {
                    console.log('Auto-syncing feed...')
                    feedApi.sync().catch(console.error)
                })
            }
        } catch (err) {
            console.error(err)
            alert('操作失敗，請稍後再試')
        }
    }

    const handleToggleNotify = async () => {
        try {
            const res = await subscriptionApi.toggleNotification(videoInfo.channel_id)
            setNotifyEnabled(res.notify_enabled)
        } catch (err) {
            console.error(err)
            alert('操作失敗')
        }
    }

    const handleStartDownload = async (type) => {
        setDownloadJob({ type, status: 'pending', progress: 0, message: '準備下載...' })
        try {
            const { job_id } = await downloadApi.start(videoId, type, videoInfo?.title || videoId)
            setDownloadJob(prev => ({ ...prev, jobId: job_id }))

            downloadPollRef.current = setInterval(async () => {
                try {
                    const data = await downloadApi.status(job_id)
                    setDownloadJob(prev => ({ ...prev, ...data, jobId: job_id }))
                    if (data.status === 'completed') {
                        clearInterval(downloadPollRef.current)
                        // Trigger browser download
                        const a = document.createElement('a')
                        a.href = downloadApi.fileUrl(job_id)
                        a.download = data.filename || `download${data.ext || ''}`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                    } else if (data.status === 'error') {
                        clearInterval(downloadPollRef.current)
                    }
                } catch {
                    clearInterval(downloadPollRef.current)
                    setDownloadJob(prev => ({ ...prev, status: 'error', message: '無法取得下載狀態' }))
                }
            }, 1500)
        } catch (err) {
            setDownloadJob(prev => ({ ...prev, status: 'error', message: '啟動下載失敗' }))
        }
    }

    // Fetch Playlist Data
    useEffect(() => {
        if (!playlistId) return

        const fetchPlaylist = async () => {
            console.log('[Watch] Fetching playlist:', playlistId)
            try {
                setPlaylistError(null)
                // We don't have a direct "get playlist info" that returns items + title conveniently in one go for generic lists
                // But for now let's assume we can get items.
                // If it's a Youtube import, we stored it in DB.
                const items = await playlistApi.getItems(playlistId)
                console.log('[Watch] Playlist loaded, count:', items?.length)
                if (Array.isArray(items)) {
                    setPlaylistItems(items)
                } else {
                    throw new Error('Invalid playlist response')
                }

                // Also try to get title
                try {
                    const playlists = await playlistApi.getAll()
                    const currentList = playlists.find(p => p.id.toString() === playlistId)
                    if (currentList) setPlaylistTitle(currentList.title)
                } catch (e) {
                    // ignore title fetch error if transient
                    if (!playlistTitle) setPlaylistTitle(`Playlist ${playlistId}`)
                }

            } catch (err) {
                console.error("Failed to load playlist", err)
                setPlaylistError(err.message || '無法載入播放清單')
            }
        }
        fetchPlaylist()
    }, [playlistId])

    // Generate shuffled indices when shuffle is toggled or items change
    useEffect(() => {
        if (!playlistItems.length) return
        if (isShuffle) {
            const indices = playlistItems.map((_, i) => i)
            // Fisher-Yates shuffle
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            // Ensure current video is first if possible, or just play through
            setShuffledIndices(indices)
        } else {
            setShuffledIndices([])
        }
    }, [isShuffle, playlistItems])

    useEffect(() => {
        const fetchVideo = async () => {
            if (!videoId) return

            try {
                setLoading(true)
                setError(null)

                // Fetch video info
                const info = await videoApi.getInfo(videoId)
                console.log('[Watch] Info received:', info?.title)
                
                // Handle case where API returns null/undefined (e.g., 404)
                if (!info) {
                    console.log('[Watch] API returned null, using embed-only mode')
                    // Still allow YouTube embed to work with minimal info
                    setVideoInfo({
                        id: videoId,
                        title: '影片載入中...',
                        thumbnail: '',
                        author: ''
                    })
                } else {
                    setVideoInfo(info)
                }

                // Feature A: Load saved progress (Only resume if it's NOT a newly loaded video)
                const isNewVideo = lastVideoIdRef.current !== videoId
                
                if (isNewVideo) {
                    console.log('[Watch] New video detected, resetting savedTime to 0')
                    setSavedTime(0)
                    lastVideoIdRef.current = videoId
                } else {
                    const savedProgress = localStorage.getItem(`progress_${videoId}`)
                    if (savedProgress) {
                        try {
                            // Try parsing new JSON format
                            const data = JSON.parse(savedProgress)
                            // Check if expired (24 hours)
                            if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                                console.log(`[Watch] Resuming from ${data.time}s`)
                                setSavedTime(data.time)
                            } else {
                                console.log('[Watch] Progress expired, starting from 0')
                                setSavedTime(0)
                            }
                        } catch (e) {
                            // Fallback for legacy format (just time string)
                            const t = parseFloat(savedProgress)
                            if (!isNaN(t) && t > 0) {
                                console.log(`[Watch] Resuming from ${t}s (Legacy)`)
                                setSavedTime(t)
                            } else {
                                setSavedTime(0)
                            }
                        }
                    } else {
                        setSavedTime(0)
                    }
                }

                // Also get audio URL
                try {
                    const audio = await videoApi.getAudioUrl(videoId)
                    setAudioUrl(audio)
                } catch {
                    // ignore
                }


                // Fetch related videos (background)
                console.log('[Watch] About to load related, playlistId:', playlistId)
                if (!playlistId) {
                    loadMoreRelatedVideos()
                }

                // Record to watch history
                const user = authApi.getCurrentUser()
                if (info) {
                    console.log('[Watch] Saving history...')
                    
                    // Always save to local watch history (for non-logged in users)
                    addLocalWatchHistory(videoId, info.title, info.thumbnail)
                    
                    // If logged in, also save to server
                    if (user) {
                        historyApi.add({
                            video_id: videoId,
                            title: info.title,
                            thumbnail: info.thumbnail,
                            progress_seconds: 0
                        }).then(() => console.log('[Watch] History saved'))
                            .catch(err => console.log('[Watch] History save failed:', err))
                    }
                }
            } catch (err) {
                console.error('[Watch] Failed to fetch video:', err)
                // Only set error if NOT using embed mode (YouTube can still play even if our API fails)
                if (!useEmbed) {
                    setError('無法載入影片，請確認連結是否正確')
                }
            } finally {
                setLoading(false)
            }
        }

        fetchVideo()
    }, [videoId, useEmbed])

    // Scroll to top when video changes and save to history
    const prevVideoIdRef = useRef(null)
    
    useEffect(() => {
        console.log('[Watch] Video changed, scrolling to top')
        window.scrollTo(0, 0)
        
        // Save current video to history before switching
        if (prevVideoIdRef.current && prevVideoIdRef.current !== videoId) {
            setVideoHistory(prev => {
                // Avoid duplicates - remove if already exists, then add to front
                const filtered = prev.filter(v => v.id !== prevVideoIdRef.current)
                const newHistory = [
                    {
                        id: prevVideoIdRef.current,
                        title: videoInfo?.title || '影片',
                        thumbnail: videoInfo?.thumbnail || ''
                    },
                    ...filtered
                ].slice(0, 50) // Keep max 50 items
                
                localStorage.setItem('videoHistory', JSON.stringify(newHistory))
                console.log('[Watch] Added to history, total:', newHistory.length)
                return newHistory
            })
        }
        
        prevVideoIdRef.current = videoId
    }, [videoId, videoInfo])

    // Stabilize the iframe URL to prevent unnecessary reloads during UI re-renders
    const embedSrc = useMemo(() => {
        // Feature A: Resume from saved time for YouTube
        const start = Math.floor(savedTime)
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&start=${start}`
    }, [videoId, savedTime])

    // Feature A: Save progress every 5s (YouTube)
    useEffect(() => {
        if (!useEmbed || !videoId) return

        const interval = setInterval(() => {
            if (youtubePlayerRef.current && typeof youtubePlayerRef.current.getCurrentTime === 'function') {
                const currentTime = youtubePlayerRef.current.getCurrentTime()
                if (currentTime > 0) {
                    const data = { time: currentTime, timestamp: Date.now() }
                    localStorage.setItem(`progress_${videoId}`, JSON.stringify(data))
                }
            }
        }, 5000)
        return () => clearInterval(interval)
    }, [useEmbed, videoId])

    // Auto-play next logic
    // Navigation Logic
    const goToNextVideo = useCallback(() => {
        if (playlistItems.length > 0) {
            let nextIndex
            if (isShuffle) {
                const currentShufflePos = shuffledIndices.findIndex(idx =>
                    playlistItems[idx]?.video_id === videoId
                )
                if (currentShufflePos !== -1 && currentShufflePos < shuffledIndices.length - 1) {
                    nextIndex = shuffledIndices[currentShufflePos + 1]
                } else {
                    nextIndex = shuffledIndices[0] // Loop to start
                }
            } else {
                const currentPos = playlistItems.findIndex(item => item.video_id === videoId)
                if (currentPos !== -1 && currentPos < playlistItems.length - 1) {
                    nextIndex = currentPos + 1
                } else {
                    nextIndex = 0 // Loop to start
                }
            }

            if (nextIndex !== undefined && playlistItems[nextIndex]) {
                console.log('[Watch] Going to NEXT:', nextIndex)
                navigate(`/watch/${playlistItems[nextIndex].video_id}?list=${playlistId}&index=${nextIndex}`)
            }
        }

        // If no playlist but has related videos, play next related video (works for both embed and proxy mode)
        if (!playlistId && relatedVideos.length > 0) {
            // Find next video that is NOT the current one and NOT in history
            const historyIds = videoHistory.map(v => v.id)
            let nextRelatedIndex = -1
            
            // Start from position 1 (skip first one, might be current video)
            for (let i = 1; i < relatedVideos.length; i++) {
                const candidate = relatedVideos[i]
                if (candidate && candidate.id && candidate.id !== videoId && !historyIds.includes(candidate.id)) {
                    nextRelatedIndex = i
                    break
                }
            }
            
            // If no valid next found, try first one if it's different
            if (nextRelatedIndex === -1) {
                const first = relatedVideos[0]
                if (first && first.id && first.id !== videoId) {
                    nextRelatedIndex = 0
                }
            }
            
            if (nextRelatedIndex !== -1) {
                const nextRelated = relatedVideos[nextRelatedIndex]
                console.log('[Watch] Going to NEXT related video:', nextRelated.title)
                navigate(`/watch/${nextRelated.id}`)
                return
            }
        }

        // If no related videos available, try to reload them
        if (!playlistId && relatedVideos.length === 0) {
            console.log('[Watch] No related videos, reloading...')
            setRelatedOffset(0)
            loadMoreRelatedVideos()
            return
        }

        console.log('[Watch] No next video to play.')
    }, [playlistItems, videoId, playlistId, isShuffle, shuffledIndices, relatedVideos, navigate, videoHistory])

    const goToPrevVideo = useCallback(() => {
        // Priority 1: Playlist mode
        if (playlistItems.length > 0) {
            let prevIndex
            if (isShuffle) {
                const currentShufflePos = shuffledIndices.findIndex(idx =>
                    playlistItems[idx]?.video_id === videoId
                )
                if (currentShufflePos !== -1 && currentShufflePos > 0) {
                    prevIndex = shuffledIndices[currentShufflePos - 1]
                } else {
                    prevIndex = shuffledIndices[shuffledIndices.length - 1] // Loop to end
                }
            } else {
                const currentPos = playlistItems.findIndex(item => item.video_id === videoId)
                if (currentPos !== -1 && currentPos > 0) {
                    prevIndex = currentPos - 1
                } else {
                    prevIndex = playlistItems.length - 1 // Loop to end
                }
            }

            if (prevIndex !== undefined && playlistItems[prevIndex]) {
                console.log('[Watch] Going to PREV:', prevIndex)
                navigate(`/watch/${playlistItems[prevIndex].video_id}?list=${playlistId}&index=${prevIndex}`)
            }
            return
        }

        // Priority 2: Go to previous video (from history stack)
        if (videoHistory.length > 0) {
            const prevVideo = videoHistory[0]
            console.log('[Watch] Going to previous video:', prevVideo.title)
            
            // Remove from history and save
            const newHistory = videoHistory.slice(1)
            setVideoHistory(newHistory)
            localStorage.setItem('videoHistory', JSON.stringify(newHistory))
            
            navigate(`/watch/${prevVideo.id}`)
            return
        }

        console.log('[Watch] No previous video available.')
    }, [playlistItems, videoId, playlistId, isShuffle, shuffledIndices, navigate, videoHistory])

    // Auto-play next logic
    const handleVideoEnd = useCallback(() => {
        console.log('[Watch] Video ended. Clearing progress & Checking auto-play...')

        // Single-track loop: replay the current video instead of advancing.
        // (Custom player handles loop internally; this covers YouTube embed mode.)
        if (loopMode) {
            const yt = youtubePlayerRef.current
            if (yt && typeof yt.seekTo === 'function') {
                yt.seekTo(0)
                yt.playVideo?.()
            }
            return
        }

        // Fix: Clear progress on end to prevent loop
        localStorage.removeItem(`progress_${videoId}`)

        // Use unified next logic
        goToNextVideo()
    }, [videoId, goToNextVideo, loopMode])

    // Auto-skip on error in playlist mode only (not related videos to avoid loops)
    useEffect(() => {
        if (error && playlistId && playlistItems.length > 0) {
            console.log('[Watch] Error detected in playlist. Auto-skipping in 2s...')
            const timer = setTimeout(() => {
                handleVideoEnd()
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [error, playlistId, playlistItems, handleVideoEnd])

    // Update document title
    useEffect(() => {
        if (videoInfo?.title) {
            document.title = `${videoInfo.title} - YT Alt`
        }
        return () => {
            document.title = 'YouTube Alternative - 無廣告播放'
        }
    }, [videoInfo?.title])

    if (loading && !videoInfo) {
        // If fake lock screen is active, keep the loading screen pitch black to prevent OLED flashes
        if (localStorage.getItem('fakeLockScreen') === 'true') {
            return (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: '#000000',
                    zIndex: 999999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{
                        width: '30px',
                        height: '30px',
                        border: '2px solid rgba(255,255,255,0.05)',
                        borderTopColor: '#333',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )
        }

        return (
            <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
                <img src="/logo.svg" className="loading-logo" alt="Loading..." />
                <p style={{ marginTop: '16px', color: '#888', fontSize: '1rem' }}>載入影片中...</p>
                <style>{`
                    .loading-logo {
                        width: 80px;
                        height: 80px;
                        animation: breathe 2s infinite ease-in-out;
                    }
                    @keyframes breathe {
                        0% { transform: scale(1); opacity: 0.8; }
                        50% { transform: scale(1.1); opacity: 1; }
                        100% { transform: scale(1); opacity: 0.8; }
                    }
                `}</style>
            </div>
        )
    }

    if (error) {
        return (
            <div className="error-message">
                <h2>😕 播放失敗</h2>
                <p>{error}</p>
                {playlistId && (
                    <p style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
                        即將播放下一首...
                    </p>
                )}
                <p style={{ marginTop: '16px', fontSize: '0.9rem', color: '#717171' }}>
                    Video ID: {videoId}
                </p>
            </div>
        )
    }

    // Playlist loading state
    const isPlaylistLoading = playlistId && playlistItems.length === 0

    return (
        <motion.div
            className="watch-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            onTouchStart={handleWatchTouchStart}
            onTouchEnd={handleWatchTouchEnd}
        >
            {/* Full-screen loading overlay only for initial load (no videoInfo yet) */}
            {loading && !videoInfo && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: localStorage.getItem('fakeLockScreen') === 'true' ? '#000000' : 'rgba(0,0,0,0.8)',
                    zIndex: 999999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{
                        width: '30px',
                        height: '30px',
                        border: `2px solid ${localStorage.getItem('fakeLockScreen') === 'true' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)'}`,
                        borderTopColor: localStorage.getItem('fakeLockScreen') === 'true' ? '#333' : '#fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            <div className="watch-container">
                <div className="main-content">
                    <div className="player-section">
                        {!isPlayerClosed && <div
                            className={`video-container${isMiniPlayer ? ' is-mini-player' : ''}`}
                            style={{
                                aspectRatio: videoInfo?.width && videoInfo?.height
                                    ? `${videoInfo.width} / ${videoInfo.height}`
                                    : '16 / 9',
                                position: 'relative'
                            }}
                        >
                            {useEmbed ? (
                                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                    <YouTube
                                        videoId={videoId}
                                        opts={embedOpts}
                                        className="youtube-player-container"
                                        style={{ width: '100%', height: '100%' }}
                                        onReady={onPlayerReady}
                                        onError={onPlayerError}
                                        onStateChange={onPlayerStateChange}
                                    />
                                    <div className="mini-player-controls">
                                        <button onClick={() => setIsMiniPlayer(prev => !prev)} aria-label={isMiniPlayer ? '恢復播放器' : '縮小到旁邊播放'}>{isMiniPlayer ? '↗' : '▣'}</button>
                                        {isMiniPlayer && <button onClick={() => { youtubePlayerRef.current?.pauseVideo?.(); setIsPlayerClosed(true); setIsMiniPlayer(false) }} aria-label="關閉播放器">×</button>}
                                    </div>

                                    {/* Smart Error Overlay - ONLY shows when YouTube fails */}
                                    {embedError && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'rgba(0,0,0,0.85)',
                                            zIndex: 50,
                                            backdropFilter: 'blur(4px)',
                                        }}>
                                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                                            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                                                此影片無法在嵌入模式播放
                                            </div>
                                            <div style={{ color: '#ccc', fontSize: '14px', marginBottom: '24px' }}>
                                                可能因版權或區域限制
                                            </div>
                                            <button
                                                onClick={() => setUseEmbed(false)}
                                                style={{
                                                    background: '#e53935',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '24px',
                                                    padding: '12px 32px',
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 4px 15px rgba(229,57,53,0.5)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                }}
                                            >
                                                🔄 切換播放器
                                            </button>
                                        </div>

                                    )}
                                </div>
                            ) : (
                                <>
                                    <VideoPlayer
                                        videoInfo={videoInfo}
                                        isLoading={loading}
                                        onEnded={handleVideoEnd}
                                        initialTime={savedTime}
                                        isShuffle={isShuffle}
                                        onToggleShuffle={() => setIsShuffle(!isShuffle)}
                                        playlist={playlistItems}
                                        currentVideoId={videoId}
                                        onNext={goToNextVideo}
                                        onPrev={goToPrevVideo}
                                        loopMode={loopMode}
                                        onSwitchToYouTube={(capturedTime) => {
                                            console.log('[Switch] TV Icon clicked, switching to YouTube Embed. Time:', capturedTime)
                                            setSavedTime(capturedTime || 0)
                                            localStorage.setItem('backgroundMode', 'false')
                                            localStorage.setItem('playerMode', 'embed')
                                            setUseEmbed(true)
                                        }}
                                        isMiniPlayer={isMiniPlayer}
                                        onToggleMiniPlayer={handleToggleMiniPlayer}
                                        onCloseMiniPlayer={() => setIsPlayerClosed(true)}
                                        onTimeUpdate={(t) => {
                                            videoTimeRef.current = t
                                            // Feature A: Save progress every 5s (approx throttle)
                                            if (Math.floor(t) % 5 === 0 && t > 0) {
                                                const data = { time: t, timestamp: Date.now() }
                                                localStorage.setItem(`progress_${videoId}`, JSON.stringify(data))
                                            }
                                        }}
                                    />
                                </>
                            )}
                        </div>}

                        {isPlayerClosed && (
                            <button className="restore-player-button" onClick={() => setIsPlayerClosed(false)}>
                                ▶ 恢復播放器
                            </button>
                        )}

                        {/* YouTube Controls Bar (Below Player) */}
                        {useEmbed && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 16px',
                                background: '#222',
                                marginTop: '12px',
                                borderRadius: '12px',
                                border: '1px solid #333'
                            }}>
                                <button
                                    onClick={goToPrevVideo}
                                    className="control-btn-nav"
                                    title="上一個影片"
                                    disabled={!playlistId && !playlistItems.length && videoHistory.length === 0}
                                    style={{ opacity: (playlistId || playlistItems.length || videoHistory.length > 0) ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                >
                                    <img src="https://api.iconify.design/famicons/play-skip-back.svg?color=white" alt="Prev" style={{ width: '16px', height: '16px' }} /> 上一個影片
                                </button>
                                <span style={{ color: '#aaa', fontSize: '13px' }}>
                                    {playlistId ? `播放清單: ${playlistItems.length} 首` : videoHistory.length > 0 ? '' : '無播放清單'}
                                </span>
                                <button
                                    onClick={goToNextVideo}
                                    className="control-btn-nav"
                                    title="下一個影片"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                >
                                    下一個影片 <img src="https://api.iconify.design/ion/play-skip-forward.svg?color=white" alt="Next" style={{ width: '16px', height: '16px' }} />
                                </button>
                                <style>{`
                                    .control-btn-nav {
                                        background: #333;
                                        border: 1px solid #444;
                                        color: #ddd;
                                        padding: 8px 10px;
                                        min-width: 100px;
                                        border-radius: 8px;
                                        cursor: pointer;
                                        font-size: 14px;
                                        font-weight: bold;
                                        transition: all 0.2s;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        gap: 6px;
                                    }
                                    .control-btn-nav:hover {
                                        background: #444;
                                        border-color: #666;
                                        color: white;
                                    }
                                    .control-btn-nav:active {
                                        transform: scale(0.96);
                                    }
                                `}</style>
                            </div>
                        )}

                        <div className="video-details">
                            <h1>{videoInfo?.title}</h1>

                            <div className="video-actions">
                                {/* Switch back to YouTube Button (Only visible when NOT in YouTube mode) */}
                                {!useEmbed && (
                                    <button
                                        className="action-button"
                                        onClick={() => {
                                            setSavedTime(videoTimeRef.current)
                                            localStorage.setItem('backgroundMode', 'false')
                                            localStorage.setItem('playerMode', 'embed')
                                            setUseEmbed(true)
                                        }}
                                        title="切換至 YouTube 原生播放器"
                                        style={{
                                            background: 'var(--accent-color)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <img src="https://api.iconify.design/mdi/youtube-tv.svg?color=white" alt="YouTube" style={{ width: '20px', height: '20px' }} /> 切換回 YouTube
                                    </button>
                                )}

                                {useEmbed && (
                                    <button
                                        className="action-button"
                                        onClick={() => {
                                            // Capture Time from YouTube
                                            let currentTime = 0
                                            if (youtubePlayerRef.current && typeof youtubePlayerRef.current.getCurrentTime === 'function') {
                                                currentTime = youtubePlayerRef.current.getCurrentTime()
                                            }
                                            console.log('[Switch] Audio Mode. Time:', currentTime)
                                            setSavedTime(currentTime)

                                            // Force Audio Mode
                                            localStorage.setItem('backgroundMode', 'true')

                                            // Switch to Proxy Player
                                            setUseEmbed(false)
                                            localStorage.setItem('playerMode', 'proxy')
                                        }}
                                        title="切換至耳機模式 (背景播放)"
                                        style={{
                                            background: '#4CAF50',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginLeft: '8px'
                                        }}
                                    >
                                        🎧 切換純音樂
                                    </button>
                                )}

                                {/* Fake Lock Screen Button - Only show on mobile */}
                                {isMobile && (
                                    <button
                                        className="action-button lock-screen-btn"
                                        onClick={() => {
                                            if (useEmbed) {
                                                let currentTime = 0
                                                if (youtubePlayerRef.current && typeof youtubePlayerRef.current.getCurrentTime === 'function') {
                                                    currentTime = youtubePlayerRef.current.getCurrentTime()
                                                }
                                                setSavedTime(currentTime)
                                                localStorage.setItem('backgroundMode', 'true')
                                                setUseEmbed(false)
                                                localStorage.setItem('playerMode', 'proxy')

                                                setTimeout(() => {
                                                    window.dispatchEvent(new CustomEvent('triggerFakeLockScreen'))
                                                }, 100)
                                            } else {
                                                window.dispatchEvent(new CustomEvent('triggerFakeLockScreen'))
                                            }
                                        }}
                                        title="啟動 OELD 隱藏畫面"
                                        style={{
                                            background: '#111',
                                            color: '#fff',
                                            border: '1px solid #555',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginLeft: useEmbed ? '0' : '8px'
                                        }}
                                    >
                                        <img
                                            src="https://api.iconify.design/material-symbols-light/background-replace-rounded.svg?color=white"
                                            alt="Fake Lock Screen Icon"
                                            style={{ width: '18px', height: '18px' }}
                                        />
                                        假背景播放
                                    </button>
                                )}

                                {/* Single-track loop — lives outside the player per user request */}
                                <button
                                    className={`action-button ${loopMode ? 'active' : ''}`}
                                    onClick={() => {
                                        const next = !loopMode
                                        setLoopMode(next)
                                        localStorage.setItem('loopMode', String(next))
                                    }}
                                    title={loopMode ? '關閉單曲循環' : '開啟單曲循環'}
                                    style={{ background: loopMode ? '#fff' : 'var(--bg-secondary)', color: loopMode ? '#000' : 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <img src={`https://api.iconify.design/material-symbols/repeat-one.svg?color=${loopMode ? 'black' : 'white'}`} alt="Loop" style={{ width: '18px', height: '18px' }} /> 單曲循環
                                </button>

                                {playlistId && (
                                    <button
                                        className={`action-button ${isShuffle ? 'active' : ''}`}
                                        onClick={() => setIsShuffle(!isShuffle)}
                                        style={{ background: isShuffle ? '#fff' : 'var(--bg-secondary)', color: isShuffle ? '#000' : 'inherit' }}
                                    >
                                        <img src={`https://api.iconify.design/cuida/shuffle-outline.svg?color=${isShuffle ? 'black' : 'white'}`} alt="Shuffle" style={{ width: '18px', height: '18px' }} /> 隨機播放
                                    </button>
                                )}
                                <span className="action-button">
                                    <img src="https://api.iconify.design/mdi/eye.svg?color=white" alt="Views" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                                    {formatViews(videoInfo?.view_count)}
                                </span>
                                {videoInfo?.published_at && (
                                    <span className="action-button">
                                        <img src="https://api.iconify.design/hugeicons/date-time.svg?color=white" alt="Date" style={{ width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                                        {formatTimeAgo(videoInfo.published_at)}
                                    </span>
                                )}
                                <button className="action-button" onClick={() => setShowDownloadModal(true)} style={{ background: '#1a73e8', color: '#fff' }}>
                                    <img src="https://api.iconify.design/mdi/download.svg?color=white" alt="Download" style={{ width: '18px', height: '18px' }} /> 下載
                                </button>
                                <button className="action-button" onClick={() => {
                                    navigator.clipboard.writeText(window.location.href)
                                    alert('連結已複製!')
                                }}>
                                    <img src="https://api.iconify.design/uil/share.svg?color=white" alt="Share" style={{ width: '18px', height: '18px' }} /> 分享
                                </button>
                                <button className="action-button" onClick={() => setShowPlaylistModal(true)}>
                                    ➕ 加入播放清單
                                </button>
                            </div>

                            <div className="video-description">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <div className="author-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {videoInfo?.author_thumbnail && (
                                            <img
                                                src={videoInfo.author_thumbnail}
                                                alt={videoInfo.author}
                                                style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                                            />
                                        )}
                                        <div>
                                            <p className="author-name" style={{ margin: 0, fontSize: '1rem' }}>
                                                {videoInfo?.author}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        className={`subscribe-btn ${isSubscribed ? 'subscribed' : ''}`}
                                        onClick={handleSubscribe}
                                    >
                                        {isSubscribed ? '已訂閱' : '訂閱'}
                                    </button>

                                    {isSubscribed && (
                                        <button
                                            onClick={handleToggleNotify}
                                            title={notifyEnabled ? "關閉通知" : "開啟通知"}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                marginLeft: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                color: notifyEnabled ? 'var(--accent-color)' : 'var(--text-secondary)'
                                            }}
                                        >
                                            {notifyEnabled ? (
                                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                                    <path d="M7.58 4.08L6.15 2.65C3.75 4.48 2.17 7.3 2.03 10.5h2c.15-2.65 1.51-4.97 3.55-6.42zm12.39 6.42h2c-.15-3.2-1.73-6.02-4.12-7.85l-1.42 1.43c2.02 1.45 3.39 3.77 3.54 6.42zM18 11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2v-5zm-6 11c.14 0 .27-.01.4-.04.65-.14 1.18-.58 1.44-1.18.1-.24.16-.49.16-.78h-4c0 1.1.9 2 2 2z" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
                                                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                                                </svg>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <p className="description-text">
                                    {videoInfo?.description || '沒有說明'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sidebar">
                    {playlistId ? (
                        <div className="playlist-panel">
                            <h3>從播放清單播放中: {playlistTitle || '載入中...'}</h3>
                            {playlistError ? (
                                <div className="error-message" style={{ padding: '20px', color: 'red', textAlign: 'center' }}>
                                    播放清單載入失敗: {playlistError}<br />
                                    <small>ID: {playlistId}</small>
                                </div>
                            ) : isPlaylistLoading ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>
                                    載入播放清單中... (ID: {playlistId})
                                </div>
                            ) : (
                                <>
                                    <div style={{ padding: '0 16px 8px', fontSize: '0.8rem', color: '#aaa' }}>
                                        {playlistItems.findIndex(i => i.video_id === videoId) + 1} / {playlistItems.length}
                                    </div>
                                    <div className="playlist-items-scroll">
                                        {playlistItems.map((item, idx) => (
                                            <div
                                                key={item.id || idx}
                                                className={`playlist-item ${item.video_id === videoId ? 'current' : ''}`}
                                                onClick={() => navigate(`/watch/${item.video_id}?list=${playlistId}&index=${idx}`)}
                                            >
                                                <span className="index">{idx + 1}</span>
                                                <img src={item.thumbnail} alt="" />
                                                <div className="info">
                                                    <div className="title">{item.title}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="related-videos">
                            <div style={{ padding: '12px 16px 8px' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: '600' }}>相關影片</span>
                            </div>
                            {loadingRelated ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa' }}>
                                    <div className="loading-spinner" style={{
                                        margin: '0 auto 12px',
                                        width: '24px',
                                        height: '24px',
                                        border: '2px solid rgba(255,255,255,0.2)',
                                        borderTopColor: '#fff',
                                        borderRadius: '50%',
                                        animation: 'spin 0.8s linear infinite'
                                    }}></div>
                                    載入相關影片...
                                </div>
                            ) : relatedVideos.length > 0 ? (
                                <>
                                    {relatedVideos.map(video => (
                                        <VideoCard key={video.id} video={video} type={isMobile ? 'vertical' : 'horizontal'} />
                                    ))}
                                    {/* Load More Related Videos Button */}
                                    {relatedHasMore && !loadingRelated && (
                                        <button 
                                            onClick={loadMoreRelatedVideos}
                                            style={{ 
                                                display: 'block', 
                                                margin: '16px auto', 
                                                padding: '10px 20px',
                                                background: 'var(--accent)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '20px',
                                                cursor: 'pointer',
                                                fontSize: '13px'
                                            }}
                                        >
                                            載入更多相關影片
                                        </button>
                                    )}

                                    {!relatedHasMore && relatedVideos.length > 0 && !loadingRelated && (
                                        <div style={{ textAlign: 'center', padding: '16px', color: '#666', fontSize: '13px' }}>
                                            沒有更多相關影片了
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {!loadingRelated && (
                                        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                                            暫無相關影片
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .watch-page {
                    width: 100%;
                    max-width: 100%;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .watch-container {
                     display: flex;
                     flex-wrap: wrap;
                     gap: 24px;
                     padding: 24px;
                     max-width: 1600px;
                     margin: 0 auto;
                }

                .main-content {
                    flex: 1;
                    min-width: 0; /* Allow shrinking */
                }

                .sidebar {
                    width: 400px;
                    flex-shrink: 0;
                }

                .video-container {
                    width: 100%;
                    background: #000;
                    border-radius: 12px;
                    overflow: hidden;
                    max-height: 80vh;
                }

                .youtube-player-container,
                .youtube-player-container iframe {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                    border: 0;
                }

                .video-details {
                    padding: 16px 0;
                }
                
                .video-details h1 {
                    font-size: 1.3rem;
                    font-weight: 600;
                    line-height: 1.4;
                    margin-bottom: 12px;
                    word-wrap: break-word;
                }
                
                .video-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-bottom: 16px;
                }
                
                .action-button {
                    padding: 8px 16px;
                    background: var(--bg-secondary);
                    border-radius: 20px;
                    font-size: 0.9rem;
                    white-space: nowrap;
                    cursor: pointer;
                    border: none;
                    color: white;
                }

                .playlist-panel {
                    border: 1px solid #333;
                    border-radius: 12px;
                    background: #1e1e1e;
                    overflow: hidden;
                    margin-bottom: 16px;
                }

                .playlist-panel h3 {
                    padding: 12px 16px;
                    font-size: 0.9rem;
                    background: #2a2a2a;
                    margin: 0;
                }

                .playlist-items-scroll {
                    max-height: 400px; /* Taller on side */
                    overflow-y: auto;
                }

                .playlist-item {
                    display: flex;
                    align-items: center;
                    padding: 8px 12px;
                    gap: 10px;
                    cursor: pointer;
                }

                .playlist-item:hover {
                    background: #333;
                }

                .playlist-item.current {
                    background: #3a3a3a;
                }

                .playlist-item .index {
                    color: #aaa;
                    font-size: 0.8rem;
                    min-width: 20px;
                }

                .playlist-item img {
                    width: 100px;
                    height: 56px;
                    object-fit: cover;
                    border-radius: 4px;
                }

                .playlist-item .info {
                     flex: 1;
                     overflow: hidden;
                }
                
                .playlist-item .title {
                    font-size: 0.85rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .video-description {
                    padding: 14px;
                    background: var(--bg-secondary);
                    border-radius: 12px;
                }
                
                .author-name {
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                
                .description-text {
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }
                
                .subscribe-btn {
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-weight: bold;
                    cursor: pointer;
                    border: none;
                    background: #fff;
                    color: #000;
                    margin-left: auto;
                    font-size: 0.9rem;
                    transition: background 0.2s;
                }
                .subscribe-btn:hover {
                    background: #e6e6e6;
                }
                .subscribe-btn.subscribed {
                    background: #333;
                    color: #fff;
                    border: 1px solid #555;
                }
                .subscribe-btn.subscribed:hover {
                    background: #444;
                }

                @media (max-width: 1024px) {
                    .watch-page {
                        /* Break out of the App <main> padding.  Using the
                           viewport here is important when the page is opened
                           inside a narrow/mobile webview: +32px only makes the
                           player wider than its content box, not full bleed. */
                        width: 100vw;
                        max-width: 100vw;
                        margin-left: calc(50% - 50vw);
                        overflow-x: clip;
                    }

                    .watch-container {
                        flex-direction: column;
                        /* Full-size mode keeps a comfortable, centered frame
                           like the reference UI.  The player is full width of
                           this content area; mini mode is fixed independently
                           below and ignores this padding. */
                        padding: 0;
                        gap: 0;
                        width: 100%;
                    }

                    .watch-page > .watch-container > .main-content {
                        width: 100%;
                        max-width: none;
                        padding: 0;
                    }

                    .player-section {
                        width: 100%;
                        padding: 16px 16px 0;
                        box-sizing: border-box;
                    }

                    .sidebar {
                        width: 100%;
                        /* The Watch page's related feed is full-bleed on mobile. */
                        padding: 0;
                    }
                    
                    .video-container {
                        border-radius: 12px;
                        margin-bottom: 0;
                        width: 100%;
                        max-width: none;
                    }

                    .video-details {
                        padding: 12px 0;
                    }

                    .related-videos {
                        padding: 0 16px;
                    }

                    .related-videos > div:first-child {
                        padding-left: 0 !important;
                        padding-right: 0 !important;
                    }

                    .related-videos .video-card {
                        margin-bottom: 20px;
                        width: 100%;
                    }

                    .related-videos .video-thumbnail {
                        /* On the Watch page only the main player is full bleed.
                           Related thumbnails stay as the compact left-aligned
                           cards shown in the mobile YouTube reference. */
                        width: 42% !important;
                        max-width: 360px;
                        height: auto !important;
                        aspect-ratio: 16 / 9;
                        border-radius: 12px;
                    }

                    .related-videos .video-info {
                        padding: 10px 0 0;
                    }

                    .related-videos .video-title {
                        font-size: 1rem !important;
                        line-height: 1.45 !important;
                    }

                    .related-videos .video-author,
                    .related-videos .video-meta {
                        font-size: 0.85rem !important;
                    }

                    /* Leave room for the fixed mobile navigation bar. */
                    .watch-page {
                        padding-bottom: 72px;
                    }
                }
            `}</style>

            <AddToPlaylistModal
                isOpen={showPlaylistModal}
                onClose={() => setShowPlaylistModal(false)}
                videoInfo={videoInfo}
            />

            {showDownloadModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={(e) => { if (e.target === e.currentTarget) { setShowDownloadModal(false); clearInterval(downloadPollRef.current); setDownloadJob(null) } }}>
                    <div style={{
                        background: '#1e1e1e', borderRadius: '16px', padding: '28px 24px',
                        width: '320px', border: '1px solid #333', position: 'relative'
                    }}>
                        <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', textAlign: 'center' }}>下載</h3>
                        <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#aaa', textAlign: 'center', wordBreak: 'break-word' }}>
                            {videoInfo?.title}
                        </p>

                        {!downloadJob ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button
                                    onClick={() => handleStartDownload('audio')}
                                    style={{
                                        background: '#4CAF50', color: '#fff', border: 'none',
                                        borderRadius: '12px', padding: '14px', fontSize: '1rem',
                                        fontWeight: 'bold', cursor: 'pointer', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', gap: '8px'
                                    }}
                                >
                                    🎵 下載音樂 (MP3)
                                </button>
                                <button
                                    onClick={() => handleStartDownload('video')}
                                    style={{
                                        background: '#1a73e8', color: '#fff', border: 'none',
                                        borderRadius: '12px', padding: '14px', fontSize: '1rem',
                                        fontWeight: 'bold', cursor: 'pointer', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', gap: '8px'
                                    }}
                                >
                                    🎬 下載影片 (MP4)
                                </button>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                {downloadJob.status === 'error' ? (
                                    <>
                                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>❌</div>
                                        <p style={{ color: '#f44336', marginBottom: '16px' }}>{downloadJob.message}</p>
                                        <button
                                            onClick={() => setDownloadJob(null)}
                                            style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer' }}
                                        >
                                            重試
                                        </button>
                                    </>
                                ) : downloadJob.status === 'completed' ? (
                                    <>
                                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✅</div>
                                        <p style={{ color: '#4CAF50', marginBottom: '16px' }}>下載完成！檔案已儲存</p>
                                        <button
                                            onClick={() => { setDownloadJob(null) }}
                                            style={{ background: '#333', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer' }}
                                        >
                                            關閉
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ marginBottom: '12px', color: '#aaa', fontSize: '0.9rem' }}>
                                            {downloadJob.type === 'audio' ? '🎵 下載音樂中...' : '🎬 下載影片中...'}
                                        </div>
                                        <div style={{ background: '#333', borderRadius: '8px', height: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                                            <div style={{
                                                height: '100%', borderRadius: '8px',
                                                background: downloadJob.type === 'audio' ? '#4CAF50' : '#1a73e8',
                                                width: `${downloadJob.progress || 0}%`,
                                                transition: 'width 0.5s ease'
                                            }} />
                                        </div>
                                        <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0 }}>{downloadJob.message}</p>
                                    </>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => { setShowDownloadModal(false); clearInterval(downloadPollRef.current); setDownloadJob(null) }}
                            style={{
                                position: 'absolute', top: '12px', right: '12px',
                                background: 'none', border: 'none', color: '#aaa',
                                fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1
                            }}
                        >✕</button>
                    </div>
                </div>
            )}
        </motion.div >
    )
}

function formatViews(count) {
    if (!count) return '0 次觀看'
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M 次觀看`
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K 次觀看`
    }
    return `${count} 次觀看`
}

export default Watch
