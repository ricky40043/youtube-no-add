import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import useMediaSession from '../hooks/useMediaSession'

// iOS detection (module-level for consistency)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

function VideoPlayer({ videoInfo, audioUrl, onEnded, initialTime = 0, onTimeUpdate: onTimeUpdateCallback, externalAudioRef }) {
    const videoRef = useRef(null)
    const audioRef = useRef(null)
    const hlsRef = useRef(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)
    const [playbackRate, setPlaybackRate] = useState(1.0)
    const [quality, setQuality] = useState('Auto')
    // Background Mode: Force Audio Only for mobile background play
    const [backgroundMode, setBackgroundMode] = useState(() => localStorage.getItem('backgroundMode') === 'true')
    const [autoAudioOnly, setAutoAudioOnly] = useState(false) // Auto-detected audio mode (no video stream)

    // Combine manual preference and auto-detection
    const useAudioOnly = backgroundMode || autoAudioOnly || !!externalAudioRef

    const [feedback, setFeedback] = useState({ show: false, text: '', icon: null })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [startTimeOffset, setStartTimeOffset] = useState(0) // Track offset for proxy seeking
    const [playbackError, setPlaybackError] = useState(false) // Track playback errors for iOS switch button

    // Gesture refs
    const lastTapTime = useRef(0)
    const longPressTimer = useRef(null)
    const touchStartX = useRef(0)
    const doubleTapTimer = useRef(null)
    const isLongPressing = useRef(false)

    // New State for Settings & Subtitles
    const [showSettings, setShowSettings] = useState(false)
    const [primarySubtitle, setPrimarySubtitle] = useState(null)
    const [secondarySubtitle, setSecondarySubtitle] = useState(null)
    const [secondarySubtitleText, setSecondarySubtitleText] = useState('')
    const [secondaryCues, setSecondaryCues] = useState([])

    // Parse VTT for secondary subtitles
    useEffect(() => {
        if (!secondarySubtitle?.url) {
            setSecondaryCues([])
            setSecondarySubtitleText('')
            return
        }

        // Use Proxy to avoid CORS
        const proxyUrl = `/api/video/proxy?url=${encodeURIComponent(secondarySubtitle.url)}`

        fetch(proxyUrl)
            .then(res => res.text())
            .then(text => {
                // ... (VTT Parser remains same)
                const lines = text.split('\n')
                const cues = []
                let currentCue = null

                // Regex for timestamp: 00:00:00.000
                const timeRegex = /(\d{2}:)?\d{2}:\d{2}\.\d{3}/

                const parseTime = (t) => {
                    const parts = t.split(':')
                    let seconds = 0
                    if (parts.length === 3) {
                        seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
                    } else {
                        seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1])
                    }
                    return seconds
                }

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim()
                    if (!line) continue
                    if (line.includes('-->')) {
                        const [start, end] = line.split(' --> ')
                        currentCue = {
                            start: parseTime(start.trim()),
                            end: parseTime(end.trim()),
                            text: ''
                        }
                    } else if (currentCue) {
                        // Accumulate text
                        currentCue.text += (currentCue.text ? '\n' : '') + line
                        // If next line is empty or timestamp, push
                        if (i + 1 >= lines.length || lines[i + 1].includes('-->') || lines[i + 1].trim() === '') {
                            cues.push(currentCue)
                            currentCue = null
                        }
                    }
                }
                setSecondaryCues(cues)
            })
            .catch(console.error)
    }, [secondarySubtitle])



    // Update Secondary Subtitle Display
    useEffect(() => {
        if (secondaryCues.length === 0) return

        const currentCue = secondaryCues.find(cue => currentTime >= cue.start && currentTime <= cue.end)
        setSecondarySubtitleText(currentCue ? currentCue.text : '')
    }, [currentTime, secondaryCues])

    // Handle Speed Change
    const handleSpeedChange = (rate) => {
        setPlaybackRate(rate)
        if (videoRef.current) {
            videoRef.current.playbackRate = rate
        }
        setShowSettings(false)
    }

    // Quality State
    const [availableQualities, setAvailableQualities] = useState([])
    const shouldRestoreTime = useRef(initialTime > 0)
    const savedTime = useRef(initialTime)

    // Parse streams and set default quality
    useEffect(() => {
        if (!videoInfo?.streams) return

        // Filter for video streams (including HLS)
        let videoStreams = videoInfo.streams.filter(s => s.type === 'combined' || s.type === 'video' || s.type === 'hls')

        // Extract unique qualities
        const qualities = [...new Set(videoStreams.map(s => s.quality))].sort((a, b) => {
            // "Auto" or "HLS" should be first (default)
            if (a.includes('Auto')) return -1
            if (b.includes('Auto')) return 1

            // Sort logic: 1080p > 720p > ...
            const getVal = (q) => parseInt(q) || 0
            return getVal(b) - getVal(a)
        })

        setAvailableQualities(qualities)

        // Default: If "360p" exists, use it (User Request for compatibility/speed)
        // Otherwise use the first one (Highest or Auto)
        if (qualities.includes("360p")) {
            setQuality("360p")
        } else if (qualities.length > 0) {
            setQuality(qualities[0])
        }
    }, [videoInfo])

    // Find the selected stream object
    const getSelectedStream = useCallback(() => {
        if (!videoInfo?.streams?.length) return null

        if (quality !== 'auto') {
            const stream = videoInfo.streams.find(s => s.quality === quality && (s.type === 'combined' || s.type === 'video' || s.type === 'hls'))
            if (stream) return stream
        }

        // Fallback or Auto
        const hls = videoInfo.streams.find(s => s.type === 'hls')
        if (hls) return hls

        const videoStreams = videoInfo.streams.filter(s => s.type === 'combined' || s.type === 'video')
        videoStreams.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))

        return videoStreams[0] || videoInfo.streams[0] || null
    }, [videoInfo, quality])

    // Get stream URL (convenience wrapper)
    const getStreamUrl = useCallback(() => {
        return getSelectedStream()?.url || null
    }, [getSelectedStream])

    // Handle Quality Change
    const handleQualityChange = (newQuality) => {
        if (newQuality === quality) return

        // Reset offset on quality change (simpler logic)
        setStartTimeOffset(0)

        // Save current time
        savedTime.current = videoRef.current ? videoRef.current.currentTime : 0
        shouldRestoreTime.current = true

        setQuality(newQuality)
        setShowSettings(false)
    }

    // Media Session handlers
    const handlePlay = useCallback(() => {
        const media = useAudioOnly ? audioRef.current : videoRef.current
        media?.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
    }, [useAudioOnly])

    const handlePause = useCallback(() => {
        const media = useAudioOnly ? audioRef.current : videoRef.current
        media?.pause()
    }, [useAudioOnly])

    const handleSeekBackward = useCallback((offset) => {
        const media = useAudioOnly ? audioRef.current : videoRef.current
        if (media) {
            media.currentTime = Math.max(0, media.currentTime - offset)
        }
    }, [useAudioOnly])

    const handleSeekForward = useCallback((offset) => {
        const media = useAudioOnly ? audioRef.current : videoRef.current
        if (media) {
            media.currentTime = Math.min(duration, media.currentTime + offset)
        }
    }, [useAudioOnly, duration])

    const { setPlaybackState, setPositionState } = useMediaSession({
        title: videoInfo?.title,
        artist: videoInfo?.author,
        artwork: videoInfo?.thumbnail,
        onPlay: handlePlay,
        onPause: handlePause,
        onSeekBackward: handleSeekBackward,
        onSeekForward: handleSeekForward,
    })

    // Initialize video/audio player
    useEffect(() => {
        const streamUrl = getStreamUrl()
        if (!streamUrl && !audioUrl) return

        // Clear previous error
        setPlaybackError(false)

        // Unified Audio Mode Logic (Background Mode or Auto-Audio)
        if (useAudioOnly) {
            if (audioRef.current) {
                // Prefer audioUrl, fallback to streamUrl if needed
                const src = audioUrl || streamUrl
                if (audioRef.current.src !== src) {
                    audioRef.current.src = src
                    audioRef.current.load()
                }

                // Seek to saved time if needed
                if (shouldRestoreTime.current && savedTime.current > 0) {
                    audioRef.current.currentTime = savedTime.current
                    shouldRestoreTime.current = false
                }

                audioRef.current.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
            }
            return
        }

        const video = videoRef.current
        if (!video) return

        // Check if HLS stream
        if (streamUrl.includes('.m3u8')) {
            // Check if HLS instance already exists and source is same
            if (hlsRef.current && hlsRef.current.url === streamUrl) {
                return
            }

            if (Hls.isSupported()) {
                if (hlsRef.current) {
                    hlsRef.current.destroy()
                }
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                })
                hlsRef.current = hls
                hls.loadSource(streamUrl)
                hls.attachMedia(video)
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
                })
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS
                if (video.src !== streamUrl) {
                    video.src = streamUrl
                    video.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
                }
            }
        } else {
            // Direct video URL
            if (video.src !== streamUrl) {
                video.src = streamUrl
                video.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
            }
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }

    }, [videoInfo, audioUrl, getStreamUrl, useAudioOnly])

    // Update playback state
    useEffect(() => {
        setPlaybackState(isPlaying ? 'playing' : 'paused')
    }, [isPlaying, setPlaybackState])

    // Update position state
    useEffect(() => {
        if (duration > 0) {
            setPositionState(duration, currentTime)
        }
    }, [currentTime, duration, setPositionState])

    // Auto-Rotate on Fullscreen
    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const handleFullscreenChange = async () => {
            // Check if browser supports orientation lock (Mainly Android)
            if (screen.orientation && screen.orientation.lock) {
                if (document.fullscreenElement) {
                    // Scenario A: Enter Fullscreen -> Force Landscape
                    try {
                        await screen.orientation.lock('landscape')
                        console.log('✅ 螢幕已鎖定為橫向')
                    } catch (err) {
                        console.warn('⚠️ 鎖定橫向失敗 (可能是裝置不支援或被系統阻擋):', err)
                    }
                } else {
                    // Scenario B: Exit Fullscreen -> Unlock (Return to portrait/sensor)
                    try {
                        screen.orientation.unlock()
                        console.log('✅ 螢幕鎖定已解除')
                    } catch (err) {
                        console.warn('⚠️ 解除鎖定失敗:', err)
                    }
                }
            }
        }

        const handleIOSFullscreen = () => {
            console.log('🍎 iOS 原生播放器啟動，依賴系統自動旋轉')
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        video.addEventListener('webkitbeginfullscreen', handleIOSFullscreen) // iOS specific

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            if (video) video.removeEventListener('webkitbeginfullscreen', handleIOSFullscreen)
        }
    }, [useAudioOnly])

    // Event handlers
    const handleTimeUpdate = (e) => {
        const t = e.target.currentTime + startTimeOffset
        setCurrentTime(t)
        onTimeUpdateCallback?.(t)
    }

    // Duration Persistence
    const maxKnownDuration = useRef(0)

    // Reset known duration when video changes
    useEffect(() => {
        maxKnownDuration.current = 0
        setDuration(0)

        // Sync initialTime to refs when video changes (for component reuse)
        savedTime.current = initialTime
        shouldRestoreTime.current = initialTime > 0
    }, [videoInfo?.id, initialTime])

    const handleLoadedMetadata = (e) => {
        const d = e.target.duration
        if (Number.isFinite(d)) {
            // Logic: Only update duration if it's the longest valid time we've seen
            // This prevents "8 seconds" bug when switching to fMP4 from valid 360p
            if (d > maxKnownDuration.current) {
                maxKnownDuration.current = d
                setDuration(d)
                console.log(`[Player] Updated duration to ${d}`)
            } else if (maxKnownDuration.current > 0) {
                // If we already know the duration is longer, force the player to acknowledge it
                // But we don't need to setDuration because it's already set to max
                console.log(`[Player] Ignoring short duration ${d}, keeping ${maxKnownDuration.current}`)
            } else {
                setDuration(d)
            }
        } else if (videoInfo?.duration) {
            // Fallback to metadata duration if stream duration is Infinity (e.g. proxy)
            setDuration(videoInfo.duration)
        }

        if (shouldRestoreTime.current) {
            console.log(`[Player] Restoring time to ${savedTime.current}`)
            e.target.currentTime = savedTime.current
            shouldRestoreTime.current = false
            // Always auto-play after time restore (user was watching before switching)
            e.target.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
        } else if (startTimeOffset > 0) {
            // If we just reloaded due to seek, we start at 0 (relative to new stream) which maps to startTimeOffset
            // No need to set currentTime
            if (isPlaying) e.target.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
        }
    }

    const handlePlayEvent = () => {
        setIsPlaying(true)
    }
    const handlePauseEvent = () => setIsPlaying(false)
    const handleEndedEvent = () => {
        console.log('[VideoPlayer] Video ended event fired.')
        setIsPlaying(false)
        onEnded?.()
    }

    // Progress bar
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    const handleSeek = (e) => {
        e.stopPropagation() // Prevent triggering play/pause
        const rect = e.currentTarget.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        let newTime = percent * duration

        if (!Number.isFinite(newTime)) return

        const media = useAudioOnly ? audioRef.current : videoRef.current

        // Check if this is a merge proxy (needs &t= reload for seeking)
        const currentStream = getSelectedStream()
        const isMergeProxy = currentStream?.proxy_type === 'merge'

        if (isMergeProxy && videoRef.current) {
            // Merge Proxy Seeking: Reload Video with &t=
            setStartTimeOffset(newTime)
            let currentUrl = currentStream.url
            let baseUrl = currentUrl.split('&t=')[0]
            videoRef.current.src = `${baseUrl}&t=${newTime}`
            videoRef.current.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
            setCurrentTime(newTime) // Update UI immediately
        } else if (media) {
            // Normal Seeking (direct proxy with Range support, HLS, etc.)
            media.currentTime = newTime
        }
    }

    const formatTime = (seconds) => {
        if (!Number.isFinite(seconds)) return '--:--'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Toggle play/pause on tap
    const handleVideoClick = () => {
        if (isPlaying) {
            handlePause()
        } else {
            handlePlay()
        }
    }

    // Touch seeking logic
    const handleTouchSeek = (e) => {
        e.stopPropagation() // Prevent bubbling
        const rect = e.currentTarget.getBoundingClientRect()
        const touch = e.touches[0]
        const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
        let newTime = percent * duration

        if (!Number.isFinite(newTime)) return

        const media = useAudioOnly ? audioRef.current : videoRef.current

        // Check if this is a merge proxy (needs &t= reload for seeking)
        const currentStream = getSelectedStream()
        const isMergeProxy = currentStream?.proxy_type === 'merge'

        if (isMergeProxy && videoRef.current) {
            // Merge Proxy Seeking: Reload Video with &t=
            setStartTimeOffset(newTime)
            let currentUrl = currentStream.url
            let baseUrl = currentUrl.split('&t=')[0]
            videoRef.current.src = `${baseUrl}&t=${newTime}`
            videoRef.current.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
            setCurrentTime(newTime)
        } else if (media) {
            // Normal Seeking (direct proxy with Range support, HLS, etc.)
            media.currentTime = newTime
        }
    }

    // Fullscreen toggle logic
    const handleFullscreenToggle = useCallback(() => {
        if (!document.fullscreenElement) {
            const container = document.querySelector('.player-container')
            if (container?.requestFullscreen) {
                container.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error)
            } else if (container?.webkitRequestFullscreen) {
                container.webkitRequestFullscreen() // iOS/Safari
            } else if (videoRef.current?.webkitEnterFullscreen) {
                videoRef.current.webkitEnterFullscreen() // iOS Native Video
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error)
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen()
            }
            setIsFullscreen(false)
        }
    }, [])

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement)
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
        }
    }, [])

    // Video Gesture Handlers (Double Tap / Long Press)
    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX
        isLongPressing.current = false

        // Start Long Press Timer (2x Speed)
        longPressTimer.current = setTimeout(() => {
            isLongPressing.current = true
            if (videoRef.current) {
                videoRef.current.playbackRate = 2.0
                setFeedback({ show: true, text: '2倍速', icon: '⏩' })
            }
        }, 500)
    }

    const handleTouchMove = (e) => {
        // Cancel long press if moved too much
        if (Math.abs(e.touches[0].clientX - touchStartX.current) > 10) {
            clearTimeout(longPressTimer.current)
        }
    }

    const handleTouchEnd = (e) => {
        // Only prevent default if we handled a gesture to strictly avoid ghost clicks
        // But for double tap logic, we usually want to block default click handling

        clearTimeout(longPressTimer.current)

        // If was long pressing, reset speed
        if (isLongPressing.current) {
            e.preventDefault()
            if (videoRef.current) videoRef.current.playbackRate = 1.0
            setFeedback({ show: false, text: '', icon: null })
            isLongPressing.current = false
            return
        }

        // Double Tap Detection
        const now = Date.now()
        if (now - lastTapTime.current < 300) {
            e.preventDefault() // Prevent zoom or other defaults
            // Double Tap!
            clearTimeout(doubleTapTimer.current)
            const width = e.currentTarget.offsetWidth
            const x = e.changedTouches[0].clientX - e.currentTarget.getBoundingClientRect().left

            if (x < width * 0.35) {
                // Left: Seek Backward
                handleSeekBackward(5)
                setFeedback({ show: true, text: '5秒', icon: '⏪' })
            } else if (x > width * 0.65) {
                // Right: Seek Forward
                handleSeekForward(5)
                setFeedback({ show: true, text: '5秒', icon: '⏩' })
            } else {
                // Center: Toggle Play/Pause
                handleVideoClick()
            }

            // Hide feedback after animation
            setTimeout(() => setFeedback({ show: false, text: '', icon: null }), 600)
            lastTapTime.current = 0 // Reset
        } else {
            // Single Tap detected - wait to see if it becomes double
            lastTapTime.current = now
            // We don't prevent default here immediately to allow onClick to fire for single taps
            // if we wanted standard behavior. But since we use onClick for play/pause,
            // the double tap might trigger it twice if we are not careful.
            // Let's rely on onClick for single tap actions to keep it responsive?
            // User requested: "Tap two times for seek".
        }
    }

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

            if (e.code === 'ArrowRight') {
                e.preventDefault()
                handleSeekForward(5)
                setFeedback({ show: true, text: '5秒', icon: '⏩' })
                setTimeout(() => setFeedback({ show: false, text: '', icon: null }), 600)
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault()
                handleSeekBackward(5)
                setFeedback({ show: true, text: '5秒', icon: '⏪' })
                setTimeout(() => setFeedback({ show: false, text: '', icon: null }), 600)
            } else if (e.code === 'Space') {
                e.preventDefault()
                handleVideoClick()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSeekForward, handleSeekBackward, handleVideoClick])

    return (
        <div className="player-container">
            {useAudioOnly ? (
                // Audio-only player (for background playback)
                <div className="audio-player" onClick={handleVideoClick}>
                    <div className="audio-cover">
                        <img src={videoInfo?.thumbnail} alt={videoInfo?.title} />
                        <div className="audio-overlay">
                            <button
                                className="play-button"
                                onClick={(e) => { e.stopPropagation(); handleVideoClick() }}
                            >
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                            {/* Toggle back to Video Mode (if available) */}
                            {!autoAudioOnly && !externalAudioRef && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        // Sync time before switch
                                        if (audioRef.current) {
                                            savedTime.current = audioRef.current.currentTime
                                            shouldRestoreTime.current = true
                                        }
                                        setBackgroundMode(false)
                                        localStorage.setItem('backgroundMode', 'false')
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        background: 'rgba(0,0,0,0.6)',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        color: 'white',
                                        padding: '8px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    📺 觀看影片
                                </button>
                            )}
                        </div>
                    </div>
                    <audio
                        ref={audioRef}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={handlePlayEvent}
                        onPause={handlePauseEvent}
                        onEnded={handleEndedEvent}
                        autoPlay
                    />
                </div>
            ) : (
                // Video player with gesture support
                <div
                    className="player-wrapper"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                >
                    <video
                        ref={videoRef}
                        className="react-player"
                        playsInline
                        webkit-playsinline="true"
                        autoPlay
                        onClick={handleVideoClick}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={handlePlayEvent}
                        onPause={handlePauseEvent}
                        onEnded={handleEndedEvent}
                        onError={(e) => {
                            const err = e.target.error
                            console.error('Video Error:', err)
                            setPlaybackError(true)
                            setIsPlaying(false)

                            // Check if there are no video streams available
                            const videoStreams = videoInfo?.streams?.filter(s => s.type === 'combined' || s.type === 'video' || s.type === 'hls')
                            if (!videoStreams || videoStreams.length === 0) {
                                console.log('No video streams, using audio only')
                                setAutoAudioOnly(true)
                            } else {
                                setAutoAudioOnly(false)
                            }
                        }}
                    />

                    {/* Playback Error — Red Switch Button */}
                    {playbackError && (
                        <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.85)',
                            zIndex: 100,
                            gap: '16px',
                            padding: '20px',
                        }}>
                            <div style={{ fontSize: '48px' }}>⚠️</div>
                            <div style={{ color: '#ff6b6b', fontSize: '16px', fontWeight: 'bold', textAlign: 'center' }}>
                                此畫質無法播放
                            </div>
                            <div style={{ color: '#aaa', fontSize: '13px', textAlign: 'center' }}>
                                目前畫質: {quality}
                            </div>
                            {/* Switch to 360p (most compatible, show first) */}
                            {availableQualities.includes('360p') && quality !== '360p' && (
                                <button
                                    onClick={() => {
                                        setPlaybackError(false)
                                        handleQualityChange('360p')
                                    }}
                                    style={{
                                        background: '#e53935',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '12px',
                                        padding: '14px 32px',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        minWidth: '200px',
                                        boxShadow: '0 4px 15px rgba(229,57,53,0.4)',
                                    }}
                                >
                                    📱 切換至 360p（最穩定）
                                </button>
                            )}
                            {/* Switch to Auto (HLS) — only if NOT already on Auto */}
                            {availableQualities.find(q => q.includes('Auto')) && !quality.toLowerCase().includes('auto') && (
                                <button
                                    onClick={() => {
                                        setPlaybackError(false)
                                        handleQualityChange(availableQualities.find(q => q.includes('Auto')))
                                    }}
                                    style={{
                                        background: '#424242',
                                        color: 'white',
                                        border: '1px solid #666',
                                        borderRadius: '12px',
                                        padding: '12px 32px',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        minWidth: '200px',
                                    }}
                                >
                                    🔄 切換至 Auto（最高畫質）
                                </button>
                            )}
                            {/* Show other available qualities as fallback */}
                            {availableQualities
                                .filter(q => q !== quality && q !== '360p' && !q.includes('Auto'))
                                .slice(0, 2)
                                .map(q => (
                                    <button
                                        key={q}
                                        onClick={() => {
                                            setPlaybackError(false)
                                            handleQualityChange(q)
                                        }}
                                        style={{
                                            background: '#333',
                                            color: '#ccc',
                                            border: '1px solid #555',
                                            borderRadius: '12px',
                                            padding: '10px 32px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            minWidth: '200px',
                                        }}
                                    >
                                        🔀 切換至 {q}
                                    </button>
                                ))
                            }
                        </div>
                    )}

                    {/* Gesture Feedback Overlay */}
                    {feedback.show && (
                        <div className="gesture-feedback">
                            <div className="feedback-icon">{feedback.icon}</div>
                            <div className="feedback-text">{feedback.text}</div>
                        </div>
                    )}

                    {/* Play/Pause overlay indicator (only when paused or waiting) */}
                    {!isPlaying && !feedback.show && !playbackError && (
                        <div className="play-indicator paused">
                            <svg viewBox="0 0 24 24" fill="white" width="60" height="60">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    )}
                </div>
            )}

            {/* Dual Subtitle Overlay (Secondary) */}
            {secondarySubtitleText && (
                <div className="subtitle-overlay secondary">
                    {secondarySubtitleText}
                </div>
            )}

            {/* Custom controls */}
            <div
                className="player-controls"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    className="control-button"
                    onClick={(e) => { e.stopPropagation(); isPlaying ? handlePause() : handlePlay() }}
                >
                    {isPlaying ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    )}
                </button>

                <div
                    className="progress-container"
                    onClick={handleSeek}
                    onTouchStart={handleTouchSeek}
                    onTouchMove={handleTouchSeek}
                    onTouchEnd={(e) => e.stopPropagation()}
                >
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }}>
                            <div className="progress-handle" />
                        </div>
                    </div>
                    {/* Hit area visualizer/expander */}
                    <div className="progress-hit-area" />
                </div>

                <span className="time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Settings Button */}
                <button
                    className="control-button"
                    onClick={() => setShowSettings(!showSettings)}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.49l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
                    </svg>
                </button>

                {/* Background Mode Toggle (Headphones) */}
                <button
                    className="control-button"
                    onClick={(e) => {
                        e.stopPropagation()
                        // Sync time before switch
                        if (videoRef.current) {
                            savedTime.current = videoRef.current.currentTime
                            shouldRestoreTime.current = true
                        }
                        setBackgroundMode(true)
                        localStorage.setItem('backgroundMode', 'true')
                    }}
                    title="背景模式 (省電/關螢幕播放)"
                >
                    <span style={{ fontSize: '18px' }}>🎧</span>
                </button>

                {/* Fullscreen Button */}
                <button
                    className="control-button"
                    onClick={(e) => { e.stopPropagation(); handleFullscreenToggle() }}
                >
                    {isFullscreen ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-14v3h3v2h-5V5h2z" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Settings Overlay */}
            {showSettings && (
                <div className="settings-overlay" onClick={() => setShowSettings(false)}>
                    <div className="settings-menu" onClick={(e) => e.stopPropagation()}>
                        <div className="settings-section">
                            <h3>畫質</h3>
                            <div className="settings-options">
                                {availableQualities.map(q => (
                                    <button
                                        key={q}
                                        className={quality === q ? 'active' : ''}
                                        onClick={() => handleQualityChange(q)}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3>播放速度</h3>
                            <div className="settings-options">
                                {[0.5, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0].map(speed => (
                                    <button
                                        key={speed}
                                        className={playbackRate === speed ? 'active' : ''}
                                        onClick={() => handleSpeedChange(speed)}
                                    >
                                        {speed}x
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Subtitles Section */}
                        <div className="settings-section">
                            <h3>主字幕 (原生)</h3>
                            <select
                                value={primarySubtitle?.lang || ''}
                                onChange={(e) => {
                                    const sub = videoInfo.subtitles?.find(s => s.lang === e.target.value)
                                    setPrimarySubtitle(sub || null)
                                }}
                            >
                                <option value="">關閉</option>
                                {videoInfo?.subtitles?.map((sub, i) => (
                                    <option key={i} value={sub.lang}>{sub.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="settings-section">
                            <h3>副字幕 (翻譯)</h3>
                            <select
                                value={secondarySubtitle?.lang || ''}
                                onChange={(e) => {
                                    const sub = videoInfo.subtitles?.find(s => s.lang === e.target.value)
                                    setSecondarySubtitle(sub || null)
                                }}
                            >
                                <option value="">關閉</option>
                                {videoInfo?.subtitles?.map((sub, i) => (
                                    <option key={i} value={sub.lang}>{sub.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .player-container {
          position: relative;
          width: 100%;
          height: 100%;
          background: #000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .video-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        
        .video-element {
          width: 100%;
          height: 100%;
          object-fit: contain;
          max-width: 100%;
        }
        
        .play-indicator {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          padding: 20px;
        }
        
        .video-wrapper:active .play-indicator {
          opacity: 1;
        }
        
        .audio-player {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        
        .audio-cover {
          position: relative;
          width: 90%;
          max-width: 400px;
          aspect-ratio: 16/9;
        }
        
        .audio-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 8px;
        }
        
        .audio-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
        }
        
        .play-button {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.9);
          color: #000;
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s;
        }
        
        .play-button:hover {
          transform: scale(1.1);
        }
        
        .player-controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 12px 16px;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
          display: flex;
          align-items: center;
          gap: 12px;
          opacity: 1;
          transition: opacity 0.3s;
        }
        
        .control-button {
          color: white;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .progress-container {
          flex: 1;
          height: 24px;
          display: flex;
          align-items: center;
          cursor: pointer;
          position: relative;
        }
        
        .progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
          z-index: 2;
        }
        
        .progress-fill {
          height: 100%;
          background: #ff0000;
          transition: width 0.1s linear;
          position: relative;
        }

        .progress-handle {
            position: absolute;
            right: -6px;
            top: 50%;
            transform: translateY(-50%) scale(1);
            width: 12px;
            height: 12px;
            background: #ff0000;
            border-radius: 50%;
            transition: transform 0.1s;
        }

        .progress-container:hover .progress-handle,
        .progress-container:active .progress-handle {
            transform: translateY(-50%) scale(1.3);
        }
        
        .progress-container:active .progress-handle {
             transform: translateY(-50%) scale(1.3);
        }
        
        /* Transparent hit area to make seeking easier */
        .progress-hit-area {
            position: absolute;
            top: -10px;
            bottom: -10px;
            left: 0;
            right: 0;
            z-index: 1;
        }
        
        .time-display {
          color: white;
          font-size: 12px;
          min-width: 70px;
          text-align: right;
          flex-shrink: 0;
        }
        
        @media (max-width: 768px) {
          .player-controls {
            padding: 8px 12px;
            gap: 10px;
          }
          
          .time-display {
            font-size: 11px;
            min-width: 60px;
          }
          
          /* Larger touch targets for mobile */
          .progress-container {
            height: 30px;
          }
          
          .progress-bar {
            height: 4px;
          }
          
          .progress-hit-area {
            top: -15px;
            bottom: -15px;
          }
          .progress-hit-area {
            top: -15px;
            bottom: -15px;
          }
        }
        
        /* Gesture Feedback Styles */
        .gesture-feedback {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 16px 24px;
            border-radius: 50px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            pointer-events: none;
            z-index: 10;
            animation: fadeInOut 0.6s ease;
        }
        
        .feedback-icon {
            font-size: 32px;
        }
        
        .feedback-text {
            font-size: 14px;
            font-weight: bold;
        }
        
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
            80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        }

        /* Settings Menu */
        .settings-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.6);
            z-index: 20;
            display: flex;
            justify-content: flex-end;
            align-items: flex-end;
            padding-bottom: 60px; /* Above controls */
            padding-right: 20px;
        }

        .settings-menu {
            background: #222;
            border-radius: 12px;
            padding: 16px;
            width: 280px;
            max-height: 70%;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .settings-section {
            margin-bottom: 16px;
        }
        .settings-section h3 {
            margin: 0 0 8px 0;
            font-size: 14px;
            color: #aaa;
        }

        .settings-options {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .settings-options button {
            background: #333;
            border: 1px solid transparent;
            color: white;
            padding: 6px 12px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 13px;
        }
        .settings-options button.active {
            background: #fff;
            color: #000;
        }
        
        select {
            width: 100%;
            background: #333;
            color: white;
            padding: 8px;
            border-radius: 8px;
            border: none;
            outline: none;
        }

        /* Secondary Subtitle Overlay */
        .subtitle-overlay {
            position: absolute;
            bottom: 80px; /* Above controls */
            left: 0; 
            right: 0;
            text-align: center;
            pointer-events: none;
            z-index: 5;
        }
        
        .subtitle-overlay.secondary {
             bottom: 120px; /* Above primary subs usually */
             color: #ffd700; /* Gold color for distinction */
             text-shadow: 0 2px 4px rgba(0,0,0,0.8);
             font-size: 16px;
             font-weight: bold;
             background: rgba(0,0,0,0.4);
             display: inline-block;
             margin: 0 auto;
             padding: 4px 12px;
             border-radius: 4px;
             max-width: 80%;
        }

      `}</style>
        </div>
    )
}

export default VideoPlayer
