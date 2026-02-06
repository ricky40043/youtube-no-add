import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import useMediaSession from '../hooks/useMediaSession'

function VideoPlayer({ videoInfo, audioUrl, onEnded }) {
    const videoRef = useRef(null)
    const audioRef = useRef(null)
    const hlsRef = useRef(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [useAudioOnly, setUseAudioOnly] = useState(false)

    const [feedback, setFeedback] = useState({ show: false, text: '', icon: null })
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Gesture refs
    const lastTapTime = useRef(0)
    const longPressTimer = useRef(null)
    const touchStartX = useRef(0)
    const doubleTapTimer = useRef(null)
    const isLongPressing = useRef(false)

    // Find best stream URL
    const getStreamUrl = useCallback(() => {
        if (!videoInfo?.streams?.length) return null

        // Prefer combined video+audio format
        const combined = videoInfo.streams.find(s => s.type === 'combined' || s.type === 'video')
        if (combined) return combined.url

        // Fallback to first available
        return videoInfo.streams[0]?.url
    }, [videoInfo])

    // Media Session handlers
    const handlePlay = useCallback(() => {
        const media = useAudioOnly ? audioRef.current : videoRef.current
        media?.play()
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

        // If only audio URL available, use audio mode
        if (!streamUrl && audioUrl) {
            setUseAudioOnly(true)
            if (audioRef.current) {
                audioRef.current.src = audioUrl
                audioRef.current.play().catch(console.error)
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
                    video.play().catch(console.error)
                })
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS
                if (video.src !== streamUrl) {
                    video.src = streamUrl
                    video.play().catch(console.error)
                }
            }
        } else {
            // Direct video URL
            if (video.src !== streamUrl) {
                video.src = streamUrl
                video.play().catch(console.error)
            }
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    }, [videoInfo, audioUrl, getStreamUrl])

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

    // Event handlers
    const handleTimeUpdate = (e) => {
        setCurrentTime(e.target.currentTime)
    }

    const handleLoadedMetadata = (e) => {
        setDuration(e.target.duration)
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
        const newTime = percent * duration
        const media = useAudioOnly ? audioRef.current : videoRef.current
        if (media) {
            media.currentTime = newTime
        }
    }

    const formatTime = (seconds) => {
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
        const newTime = percent * duration

        const media = useAudioOnly ? audioRef.current : videoRef.current
        if (media) {
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
                        </div>
                    </div>
                    <audio
                        ref={audioRef}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={handlePlayEvent}
                        onPause={handlePauseEvent}
                        onEnded={handleEndedEvent}
                    />
                </div>
            ) : (
                // Video player with gesture support
                <div
                    className="video-wrapper"
                    onClick={handleVideoClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                >
                    <video
                        ref={videoRef}
                        className="video-element"
                        playsInline
                        webkit-playsinline="true"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={handlePlayEvent}
                        onPause={handlePauseEvent}
                        onEnded={handleEndedEvent}
                    />

                    {/* Gesture Feedback Overlay */}
                    {feedback.show && (
                        <div className="gesture-feedback">
                            <div className="feedback-icon">{feedback.icon}</div>
                            <div className="feedback-text">{feedback.text}</div>
                        </div>
                    )}

                    {/* Play/Pause overlay indicator (only when paused or waiting) */}
                    {!isPlaying && !feedback.show && (
                        <div className="play-indicator paused">
                            <svg viewBox="0 0 24 24" fill="white" width="60" height="60">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    )}
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
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    {/* Hit area visualizer/expander */}
                    <div className="progress-hit-area" />
                </div>

                <span className="time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Fullscreen Button */}
                <button
                    className="control-button"
                    onClick={(e) => { e.stopPropagation(); handleFullscreenToggle() }}
                    style={{ marginLeft: 'auto' }}
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

      `}</style>
        </div>
    )
}

export default VideoPlayer
