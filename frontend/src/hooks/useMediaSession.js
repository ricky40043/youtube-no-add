import { useEffect, useCallback } from 'react'

/**
 * Custom hook for Media Session API - enables lock screen controls and background playback
 */
export function useMediaSession({
    title,
    artist,
    artwork,
    onPlay,
    onPause,
    onNext,
    onPrevious,
    onSeekBackward,
    onSeekForward,
}) {

    const updateMetadata = useCallback(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title || 'Unknown Title',
                artist: artist || 'Unknown Artist',
                album: 'YouTube Alternative',
                artwork: artwork ? [
                    { src: artwork, sizes: '96x96', type: 'image/jpeg' },
                    { src: artwork, sizes: '128x128', type: 'image/jpeg' },
                    { src: artwork, sizes: '192x192', type: 'image/jpeg' },
                    { src: artwork, sizes: '256x256', type: 'image/jpeg' },
                    { src: artwork, sizes: '384x384', type: 'image/jpeg' },
                    { src: artwork, sizes: '512x512', type: 'image/jpeg' },
                ] : [],
            })
        }
    }, [title, artist, artwork])

    useEffect(() => {
        if (!('mediaSession' in navigator)) {
            console.warn('Media Session API not supported')
            return
        }

        // Update metadata
        updateMetadata()

        // Set up action handlers
        if (onPlay) {
            navigator.mediaSession.setActionHandler('play', onPlay)
        }

        if (onPause) {
            navigator.mediaSession.setActionHandler('pause', onPause)
        }

        if (onNext) {
            navigator.mediaSession.setActionHandler('nexttrack', onNext)
        }

        if (onPrevious) {
            navigator.mediaSession.setActionHandler('previoustrack', onPrevious)
        }

        if (onSeekBackward) {
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                onSeekBackward(details.seekOffset || 10)
            })
        }

        if (onSeekForward) {
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                onSeekForward(details.seekOffset || 10)
            })
        }

        // Cleanup
        return () => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.setActionHandler('play', null)
                navigator.mediaSession.setActionHandler('pause', null)
                navigator.mediaSession.setActionHandler('nexttrack', null)
                navigator.mediaSession.setActionHandler('previoustrack', null)
                navigator.mediaSession.setActionHandler('seekbackward', null)
                navigator.mediaSession.setActionHandler('seekforward', null)
            }
        }
    }, [onPlay, onPause, onNext, onPrevious, onSeekBackward, onSeekForward, updateMetadata])

    // Update playback state
    const setPlaybackState = useCallback((state) => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = state // 'playing', 'paused', 'none'
        }
    }, [])

    // Update position state
    const setPositionState = useCallback((duration, position, playbackRate = 1) => {
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: duration || 0,
                    playbackRate: playbackRate,
                    position: position || 0,
                })
            } catch (e) {
                console.warn('Failed to set position state:', e)
            }
        }
    }, [])

    return {
        updateMetadata,
        setPlaybackState,
        setPositionState,
    }
}

export default useMediaSession
