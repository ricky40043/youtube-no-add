import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Hls from 'hls.js'
import useMediaSession from '../hooks/useMediaSession'

// iOS detection (module-level for consistency)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

function VideoPlayer({
    videoInfo,
    audioUrl,
    isLoading = false,
    onEnded,
    initialTime = 0,
    onTimeUpdate: onTimeUpdateCallback,
    onSwitchToYouTube,
    externalAudioRef,
    playlist = [],
    currentVideoId,
    isShuffle = false,
    onNext,
    onPrev,
    loopMode = false,
    isMiniPlayer = false,
    onToggleMiniPlayer,
    onCloseMiniPlayer
}) {
    const videoRef = useRef(null)
    const audioRef = useRef(null)
    const hlsRef = useRef(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isSeeking, setIsSeeking] = useState(false)
    const seekPreviewRef = useRef(0)
    const [volume, setVolume] = useState(1)
    const [volumePreview, setVolumePreview] = useState(1)
    const volumePreviewRef = useRef(1)
    const [muted, setMuted] = useState(false)
    const [playbackRate, setPlaybackRate] = useState(1.0)
    const [quality, setQuality] = useState('Auto')
    // Background Mode: Force Audio Only for mobile background play
    const [backgroundMode, setBackgroundMode] = useState(() => localStorage.getItem('backgroundMode') === 'true')
    const [autoAudioOnly, setAutoAudioOnly] = useState(false) // Auto-detected audio mode (no video stream)

    // Single-track loop (repeat current track) — controlled by parent (Watch),
    // so the toggle button can live outside the player. Sync to a ref for the
    // ended handler to avoid stale closures.
    const loopRef = useRef(loopMode)
    useEffect(() => { loopRef.current = loopMode }, [loopMode])

    // Combine manual preference and auto-detection
    const useAudioOnly = backgroundMode || autoAudioOnly || !!externalAudioRef

    const applyVolume = useCallback((nextVolume) => {
        const next = Math.max(0, Math.min(1, Number(nextVolume)))
        setVolume(next)
        setVolumePreview(next)
        volumePreviewRef.current = next
        if (videoRef.current) videoRef.current.volume = next
        if (audioRef.current) audioRef.current.volume = next
    }, [])

    const previewVolume = (nextVolume) => {
        const next = Math.max(0, Math.min(1, Number(nextVolume)))
        setVolumePreview(next)
        volumePreviewRef.current = next
    }

    const commitVolume = () => applyVolume(volumePreviewRef.current)

    useEffect(() => {
        if (videoRef.current) videoRef.current.volume = volume
        if (audioRef.current) audioRef.current.volume = volume
    }, [volume, useAudioOnly])

    const [feedback, setFeedback] = useState({ show: false, text: '', icon: null })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [startTimeOffset, setStartTimeOffset] = useState(0) // Track offset for proxy seeking
    const [playbackError, setPlaybackError] = useState(false) // Track playback errors for iOS switch button

    // Fake Lock Screen States
    const [isFakeLockScreen, setIsFakeLockScreen] = useState(() => localStorage.getItem('fakeLockScreen') === 'true')
    const [clockTime, setClockTime] = useState('')
    const [burnInOffset, setBurnInOffset] = useState({ x: 0, y: 0 })
    const wakeLockRef = useRef(null)
    const lockScreenTapTimeRef = useRef(0)

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
        onNext: onNext,       // lock-screen / headphone next track
        onPrevious: onPrev,   // lock-screen / headphone previous track
    })

    // Initialize video/audio player
    useEffect(() => {
        const streamUrl = getStreamUrl()
        if (!streamUrl && !audioUrl) return

        // Clear previous error
        setPlaybackError(false)

        // If loading next video, ensure current video pauses
        if (isLoading) {
            if (useAudioOnly && audioRef.current) audioRef.current.pause()
            if (!useAudioOnly && videoRef.current) videoRef.current.pause()
            return
        }

        // Unified Audio Mode Logic (Background Mode or Auto-Audio)
        if (useAudioOnly) {
            if (audioRef.current) {
                // Prefer audioUrl, fallback to streamUrl if needed
                const src = audioUrl || streamUrl
                if (audioRef.current.src !== src) {
                    audioRef.current.src = src
                    audioRef.current.loop = false // Disable loop for real content
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

    }, [videoInfo, audioUrl, getStreamUrl, useAudioOnly, isLoading])

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

        // SBR Duration Fix: Force next track if playback exceeds total duration
        // (Since we clamped the duration display, but the file might be physically longer)
        if (useAudioOnly && duration > 0 && t > duration + 1) {
            console.log(`[VideoPlayer] Playback time ${t.toFixed(1)} exceeded duration ${duration}. Forcing next track.`)
            handleEndedEvent()
            return
        }

        // While scrubbing, the media element may continue emitting its old
        // position. Do not let that overwrite the position shown under the
        // user's finger; the actual seek is committed on pointer release.
        if (!isSeeking) {
            setCurrentTime(t)
            onTimeUpdateCallback?.(t)
        }
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
        let d = e.target.duration

        // SBR Codec Fix: If detected duration is ~2x the API duration, trust API
        // Some AAC/MP3 files with SBR are misreported by browsers as double length
        if (videoInfo?.duration && Number.isFinite(d)) {
            const ratio = d / videoInfo.duration
            if (ratio > 1.8 && ratio < 2.2) {
                console.log(`[Player] Detected SBR double duration bug. Correcting ${d} -> ${videoInfo.duration}`)
                d = videoInfo.duration
            }
        }

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

        // Single-track loop: replay the current track and DON'T advance
        if (loopRef.current) {
            const media = useAudioOnly ? audioRef.current : videoRef.current
            if (media) {
                media.currentTime = 0
                media.play().catch(e => { if (e.name !== 'NotAllowedError') console.error(e) })
            }
            return
        }

        // Mobile Autoplay Fix: Use silence spacer to keep audio session alive
        if (useAudioOnly && audioRef.current) {
            // 0.1s silent MP3 (minimal size)
            const silent = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAAAAAAAAAAAASAACCQAAAAAAAAAAAD/84TBAAAAAA00AAAARAAAABwAAAAAABAAJ/wAA/wAAAAAAFdlZm10LnhtbAAAAAAAWHZuFgAAAAAABAACAAAABgAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/84TBAAAAAA00AAAARAAAABwAAAAAABAAJ/wAA/wAAAAAAFdlZm10LnhtbAAAAAAAWHZuFgAAAAAABAACAAAABgAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/84TBAAAAAA00AAAARAAAABwAAAAAABAAJ/wAA/wAAAAAAFdlZm10LnhtbAAAAAAAWHZuFgAAAAAABAACAAAABgAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
            audioRef.current.src = silent
            audioRef.current.loop = true // Loop silence to keep session alive until next track loads
            audioRef.current.play().catch(console.error)
            console.log('[VideoPlayer] Playing silence spacer to keep session alive')
        }

        setIsPlaying(false)
        onEnded?.()
    }

    // Progress bar
    const displayedTime = isSeeking ? seekPreviewRef.current : currentTime
    const displayedProgress = duration > 0 ? (displayedTime / duration) * 100 : 0

    const getSeekTime = (element, clientX) => {
        const rect = element.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const newTime = percent * duration
        return Number.isFinite(newTime) ? newTime : null
    }

    const commitSeek = (newTime) => {
        if (newTime === null) return
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

    const previewSeek = (e) => {
        const newTime = getSeekTime(e.currentTarget, e.clientX)
        if (newTime === null) return
        seekPreviewRef.current = newTime
        setCurrentTime(newTime)
    }

    const handleSeekStart = (e) => {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setIsSeeking(true)
        previewSeek(e)
    }

    const handleSeekMove = (e) => {
        if (!isSeeking) return
        e.stopPropagation()
        e.preventDefault()
        previewSeek(e)
    }

    const handleSeekEnd = (e) => {
        if (!isSeeking) return
        e.stopPropagation()
        e.preventDefault()
        commitSeek(seekPreviewRef.current)
        setIsSeeking(false)
    }

    const handleSeekCancel = (e) => {
        if (!isSeeking) return
        e.stopPropagation()
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        setCurrentTime(videoRef.current?.currentTime ?? audioRef.current?.currentTime ?? currentTime)
        setIsSeeking(false)
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

    // Fake Lock Screen Handlers
    const enableFakeLockScreen = async () => {
        try {
            // 1. Request Wake Lock
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen')
            }
            // 2. Request Fullscreen
            const container = document.querySelector('.player-container')
            if (container?.requestFullscreen) {
                await container.requestFullscreen()
            } else if (container?.webkitRequestFullscreen) {
                await container.webkitRequestFullscreen()
            }
            // 3. Set State
            setIsFakeLockScreen(true)
            localStorage.setItem('fakeLockScreen', 'true')
            setShowSettings(false)
            // 4. Auto-play if paused
            if (!isPlaying) {
                handlePlay()
            }
        } catch (err) {
            console.error('Failed to enable fake lock screen:', err)
            // Even if fullscreen or wakelock fails (e.g. old iOS), we still show the black screen UI
            setIsFakeLockScreen(true)
            localStorage.setItem('fakeLockScreen', 'true')
            setShowSettings(false)
            if (!isPlaying) {
                handlePlay()
            }
        }
    }

    const disableFakeLockScreen = async () => {
        try {
            // 1. Release Wake Lock
            if (wakeLockRef.current) {
                await wakeLockRef.current.release()
                wakeLockRef.current = null
            }
            // 2. Exit Fullscreen (only if we are currently fullscreen)
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    await document.exitFullscreen()
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen()
                }
            }
        } catch (err) {
            console.error('Failed to disable fake lock screen:', err)
        } finally {
            // 3. Set State
            setIsFakeLockScreen(false)
            localStorage.setItem('fakeLockScreen', 'false')
            lockScreenTapTimeRef.current = 0
        }
    }

    const handleLockScreenTouchStart = (e) => {
        // Prevent default to avoid any native double-tap zoom
        e.preventDefault()
    }

    const handleLockScreenTouchEnd = (e) => {
        e.preventDefault() // Block default clicks
        const now = Date.now()

        if (now - lockScreenTapTimeRef.current < 300) {
            // Double Tap Detected
            disableFakeLockScreen()
            lockScreenTapTimeRef.current = 0
        } else {
            // Single Tap
            lockScreenTapTimeRef.current = now
        }
    }

    // Fake Lock Screen Clock & Burn-in Protection
    useEffect(() => {
        if (!isFakeLockScreen) return

        const updateClock = () => {
            const now = new Date()
            const hours = String(now.getHours()).padStart(2, '0')
            const minutes = String(now.getMinutes()).padStart(2, '0')
            setClockTime(`${hours}:${minutes}`)
        }

        const updateBurnInOffset = () => {
            // Random offset between -5px and 5px
            setBurnInOffset({
                x: Math.floor(Math.random() * 11) - 5,
                y: Math.floor(Math.random() * 11) - 5
            })
        }

        updateClock() // Initial update
        const clockInterval = setInterval(updateClock, 1000)
        const burnInInterval = setInterval(updateBurnInOffset, 60000) // Every minute

        // Attempt to request locks safely when re-mounted in lock screen mode
        const attemptLocks = async () => {
            try {
                if ('wakeLock' in navigator && !wakeLockRef.current) {
                    wakeLockRef.current = await navigator.wakeLock.request('screen').catch(() => null)
                }
                const container = document.querySelector('.player-container')
                if (container?.requestFullscreen && !document.fullscreenElement) {
                    await container.requestFullscreen().catch(() => null)
                }
            } catch (e) {
                // Ignore auto-lock errors (requires user interaction)
            }
        }
        attemptLocks()

        return () => {
            clearInterval(clockInterval)
            clearInterval(burnInInterval)
        }
    }, [isFakeLockScreen])

    // Cleanup Wake Lock on unmount just in case
    useEffect(() => {
        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(console.error)
            }
        }
    }, [])

    // Listen for external trigger (e.g., from Watch.jsx)
    useEffect(() => {
        const handleTrigger = () => {
            enableFakeLockScreen()
        }
        window.addEventListener('triggerFakeLockScreen', handleTrigger)
        return () => window.removeEventListener('triggerFakeLockScreen', handleTrigger)
    }, [])


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

    // Audio (music) mode tap zones:
    //  - Center 1/3: single tap toggles play/pause
    //  - Left/Right 1/3: ONLY double-tap seeks ±5s (single tap does nothing,
    //    so it no longer fights with play/pause — per user request)
    const handleAudioTouchEnd = (e) => {
        e.preventDefault() // block the synthesized click so play/pause doesn't also fire
        const width = e.currentTarget.offsetWidth
        const x = e.changedTouches[0].clientX - e.currentTarget.getBoundingClientRect().left
        const now = Date.now()
        const isDouble = now - lastTapTime.current < 300

        if (x < width * 0.35) {
            // Left zone: double-tap rewinds, single tap is ignored
            if (isDouble) {
                handleSeekBackward(5)
                setFeedback({ show: true, text: '5秒', icon: '⏪' })
                setTimeout(() => setFeedback({ show: false, text: '', icon: null }), 600)
                lastTapTime.current = 0
            } else {
                lastTapTime.current = now
            }
        } else if (x > width * 0.65) {
            // Right zone: double-tap forwards, single tap is ignored
            if (isDouble) {
                handleSeekForward(5)
                setFeedback({ show: true, text: '5秒', icon: '⏩' })
                setTimeout(() => setFeedback({ show: false, text: '', icon: null }), 600)
                lastTapTime.current = 0
            } else {
                lastTapTime.current = now
            }
        } else {
            // Center zone only: tap toggles play/pause
            handleVideoClick()
            lastTapTime.current = 0
        }
    }

    // Desktop / mouse fallback: play/pause only when clicking the center zone
    const handleAudioClick = (e) => {
        const width = e.currentTarget.offsetWidth
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left
        if (x >= width * 0.35 && x <= width * 0.65) {
            handleVideoClick()
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
                <div className="audio-player" onClick={handleAudioClick} onTouchEnd={handleAudioTouchEnd}>
                    <div className="audio-cover">
                        <img src={videoInfo?.thumbnail} alt={videoInfo?.title} />
                        <div className="audio-overlay">
                            <button
                                className="play-button"
                                onClick={(e) => { e.stopPropagation(); handleVideoClick() }}
                            >
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                        </div>
                        {/* Double-tap seek feedback */}
                        {feedback.show && (
                            <div className="gesture-feedback">
                                <div className="feedback-icon">{feedback.icon}</div>
                                <div className="feedback-text">{feedback.text}</div>
                            </div>
                        )}
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

            {/* Fake Lock Screen Overlay (Portaled to document.body) */}
            {isFakeLockScreen && createPortal(
                <div
                    className="fake-lock-screen"
                    onTouchStart={handleLockScreenTouchStart}
                    onTouchEnd={handleLockScreenTouchEnd}
                    style={{
                        transform: `translate(${burnInOffset.x}px, ${burnInOffset.y}px)`
                    }}
                >
                    <div className="lock-info">
                        <div className="lock-title">{videoInfo?.title}</div>
                        <div className="lock-progress">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>

                    <div className="lock-hint">連按兩下螢幕解鎖</div>
                </div>,
                document.body
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
                {/* Prev / Play / Next — only in video mode. In音樂模式 use the big
                    side arrows + center play button, and keep the control bar minimal
                    (timeline + time + loop) so the timeline isn't squeezed away. */}
                {!useAudioOnly && (
                    <>
                        {onPrev && (
                            <button
                                className="control-button"
                                onClick={(e) => { e.stopPropagation(); onPrev() }}
                                title="上一首"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                </svg>
                            </button>
                        )}

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

                        {onNext && (
                            <button
                                className="control-button"
                                onClick={(e) => { e.stopPropagation(); onNext() }}
                                title="下一首"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                </svg>
                            </button>
                        )}
                    </>
                )}

                <div
                    className="progress-container"
                    onPointerDown={handleSeekStart}
                    onPointerMove={handleSeekMove}
                    onPointerUp={handleSeekEnd}
                    onPointerCancel={handleSeekCancel}
                >
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${displayedProgress}%` }} />
                    </div>
                    {/* Knob lives in the container (not inside the overflow:hidden bar)
                        so it renders as one full circle instead of a clipped sliver */}
                    <div className="progress-handle" style={{ left: `${displayedProgress}%` }} />
                    {/* Hit area visualizer/expander */}
                    <div className="progress-hit-area" />
                </div>

                <span className="time-display">
                    {formatTime(isSeeking ? seekPreviewRef.current : currentTime)} / {formatTime(duration)}
                </span>

                {useAudioOnly && (
                    <label className="volume-control" title="音量">
                        <span aria-hidden="true">🔊</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volumePreview}
                            onChange={(e) => previewVolume(e.target.value)}
                            onPointerUp={commitVolume}
                            onPointerCancel={commitVolume}
                            onTouchEnd={commitVolume}
                            aria-label="音量"
                        />
                    </label>
                )}

                {onToggleMiniPlayer && (
                    <button
                        className="control-button mini-toggle-button"
                        onClick={(e) => { e.stopPropagation(); onToggleMiniPlayer() }}
                        title={isMiniPlayer ? '恢復播放器' : '縮小到旁邊播放'}
                        aria-label={isMiniPlayer ? '恢復播放器' : '縮小到旁邊播放'}
                    >{isMiniPlayer ? '↗' : '▣'}</button>
                )}

                {/* Settings / Switch / Fullscreen — hidden in 音樂模式 to keep the bar minimal */}
                {!useAudioOnly && (
                  <>
                {/* Settings Button */}
                <button
                    className="control-button"
                    onClick={() => setShowSettings(!showSettings)}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.49l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
                    </svg>
                </button>

                {/* Background Mode Toggle (Headphones / TV) */}
                {!autoAudioOnly && !externalAudioRef && (
                    <button
                        className="control-button"
                        onClick={(e) => {
                            e.stopPropagation()

                            if (useAudioOnly) {
                                // Switch TO YouTube instead of local Video mode
                                if (audioRef.current) {
                                    savedTime.current = audioRef.current.currentTime
                                    shouldRestoreTime.current = true
                                }
                                if (onSwitchToYouTube) {
                                    onSwitchToYouTube(savedTime.current)
                                }
                            } else {
                                // Switch TO Audio
                                if (videoRef.current) {
                                    savedTime.current = videoRef.current.currentTime
                                    shouldRestoreTime.current = true
                                }
                                setBackgroundMode(true)
                                localStorage.setItem('backgroundMode', 'true')
                            }
                        }}
                        title={useAudioOnly ? "切換至 YouTube 播放器" : "背景模式 (省電/關螢幕播放)"}
                    >
                        {useAudioOnly ? (
                            <span style={{ fontSize: '18px' }} title="切換至 YouTube">📺</span>
                        ) : (
                            <span style={{ fontSize: '18px' }}>🎧</span>
                        )}
                    </button>
                )}

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
                </>
                )}
                {isMiniPlayer && onCloseMiniPlayer && (
                    <button
                        className="control-button mini-close-button"
                        onClick={(e) => { e.stopPropagation(); onCloseMiniPlayer() }}
                        title="關閉播放器"
                        aria-label="關閉播放器"
                    >×</button>
                )}
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
            )
            }

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
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: rgba(0, 0, 0, 0.4);
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

        .lock-text-btn {
            background: rgba(0, 0, 0, 0.6);
            color: #ddd;
            border: 1px solid #555;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .lock-text-btn:hover {
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            border-color: #777;
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
          /* Let the bar own the touch gesture so dragging scrubs instead of
             scrolling the page (fixes "hard to drag" in music mode) */
          touch-action: none;
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
            top: 50%;
            transform: translate(-50%, -50%) scale(1);
            width: 16px;
            height: 16px;
            background: #ff0000;
            border: 2px solid #fff;
            border-radius: 50%;
            box-shadow: 0 1px 5px rgba(0,0,0,0.6);
            transition: transform 0.1s;
            z-index: 3;
            pointer-events: none;
        }

        .progress-container:hover .progress-handle,
        .progress-container:active .progress-handle {
            transform: translate(-50%, -50%) scale(1.35);
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
            height: 36px;
          }

          .progress-bar {
            height: 6px;
          }

          .progress-handle {
            width: 18px;
            height: 18px;
          }

          .progress-hit-area {
            top: -16px;
            bottom: -16px;
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

        /* Fake Lock Screen Styles */
        .fake-lock-screen {
            position: fixed;
            inset: 0;
            background-color: #000000;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding-top: 15vh;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            color: #ffffff;
            transition: transform 1s ease-in-out; /* Smooth burn-in shift */
        }

        .lock-icon {
            font-size: 20px;
            color: #666666;
            margin-bottom: 20px;
        }

        .lock-clock {
            font-size: 5rem;
            font-weight: bold;
            color: #555555; /* Much darker white/gray to save OLED power */
            margin-bottom: 40px;
            letter-spacing: 2px;
        }

        .lock-info {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 80%;
            text-align: center;
        }

        .lock-title {
            font-size: 1.2rem;
            color: #666666; /* Darker title */
            margin-bottom: 12px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .lock-progress {
            font-size: 0.9rem;
            color: #444444; /* Darker progress */
        }

        .lock-hint {
            position: absolute;
            bottom: 40px;
            font-size: 0.8rem;
            color: #222222; /* Very dark hint */
            animation: breathe 2s infinite ease-in-out;
        }

        @keyframes breathe {
            0% { opacity: 0.3; }
            50% { opacity: 1; }
            100% { opacity: 0.3; }
        }

        .lock-btn svg {
            fill: #999;
        }
        .lock-btn:hover svg {
            fill: #fff;
        }

      `}</style>
            {/* Navigation Overlays (Desktop Hover / Mobile Visible) */}
            {/* Left - Prev */}
            {
                onPrev && (
                    <div
                        className="nav-overlay left"
                        onClick={(e) => { e.stopPropagation(); onPrev() }}
                    >
                        <img src="https://api.iconify.design/famicons/play-skip-back.svg?color=white" alt="Prev" width="32" height="32" />
                    </div>
                )
            }

            {/* Right - Next */}
            {
                onNext && (
                    <div
                        className="nav-overlay right"
                        onClick={(e) => { e.stopPropagation(); onNext() }}
                    >
                        <img src="https://api.iconify.design/ion/play-skip-forward.svg?color=white" alt="Next" width="32" height="32" />
                    </div>
                )
            }

            <style>{`
                .nav-overlay {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 50px;
                    height: 50px;
                    background: rgba(0,0,0,0.4);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 25;
                    opacity: 0;
                    transition: all 0.2s;
                    backdrop-filter: blur(2px);
                }
                /* Show on hover for desktop */
                .player-wrapper:hover .nav-overlay {
                    opacity: 1;
                }
                
                @media (hover: none) {
                   .nav-overlay {
                       background: rgba(0,0,0,0.2);
                       opacity: 0.6; /* Always visible on touch devices */
                   }
                }

                .nav-overlay:hover {
                    background: rgba(0,0,0,0.7);
                    transform: translateY(-50%) scale(1.1);
                }
                .nav-overlay:active {
                    transform: translateY(-50%) scale(0.9);
                }

                .nav-overlay.left { left: 20px; }
                .nav-overlay.right { right: 20px; }
            `}</style>
        </div >
    )
}

export default VideoPlayer
