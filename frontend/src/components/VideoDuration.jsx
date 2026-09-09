import { useEffect, useRef, useState } from 'react'

import { getVideoMetadata } from '../services/videoMetadata'
import { getVideoDurationLabel } from '../utils/video'

function VideoDuration({ video }) {
    const badgeRef = useRef(null)
    const [metadata, setMetadata] = useState(null)
    const [finishedId, setFinishedId] = useState(null)
    const label = getVideoDurationLabel(video)

    useEffect(() => {
        if (label || !video.id) return
        let cancelled = false
        const load = async () => {
            try {
                const info = await getVideoMetadata(video.id)
                if (!cancelled) setMetadata(info)
            } catch {
                // Keep the card usable when a video is private or unavailable.
            } finally {
                if (!cancelled) setFinishedId(video.id)
            }
        }

        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer.disconnect()
                load()
            }
        }, { rootMargin: '200px' })
        if (badgeRef.current) observer.observe(badgeRef.current)
        return () => {
            cancelled = true
            observer.disconnect()
        }
    }, [video.id, label])

    const resolvedLabel = label || (metadata?.id === video.id ? getVideoDurationLabel(metadata) : '')
    const text = resolvedLabel || (finishedId === video.id || !video.id ? '時長未知' : '讀取時長…')

    return (
        <span ref={badgeRef} className="video-duration" aria-label={`影片時長：${text}`}>
            {text}
        </span>
    )
}

export default VideoDuration
