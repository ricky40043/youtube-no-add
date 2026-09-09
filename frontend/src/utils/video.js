const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/

export function extractYouTubeVideoId(value) {
    const input = value.trim()
    if (VIDEO_ID.test(input)) return input

    try {
        const url = new URL(input.startsWith('//') ? `https:${input}` :
            /^[a-z]+:\/\//i.test(input) ? input : `https://${input}`)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null

        const host = url.hostname.toLowerCase()
        const parts = url.pathname.split('/').filter(Boolean)
        let id = null
        if (host === 'youtu.be' || host === 'www.youtu.be') {
            if (parts.length === 1) id = parts[0]
        } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
            if (url.pathname === '/watch') id = url.searchParams.get('v')
            else if (parts.length === 2 && ['shorts', 'live', 'embed', 'v'].includes(parts[0])) id = parts[1]
        } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
            if (parts.length === 2 && parts[0] === 'embed') id = parts[1]
        }
        return id && VIDEO_ID.test(id) ? id : null
    } catch {
        return null
    }
}

export function formatDuration(value) {
    if (value == null || typeof value === 'boolean') return ''
    let seconds = Number(value)
    if (typeof value === 'string' && /^\d+(?::[0-5]\d){1,2}$/.test(value.trim())) {
        seconds = value.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0)
    }
    if (!Number.isFinite(seconds) || seconds <= 0) return ''

    seconds = Math.floor(seconds)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainder = String(seconds % 60).padStart(2, '0')
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
        : `${minutes}:${remainder}`
}

export function getVideoDurationLabel(video) {
    if (video.is_live || video.live_status === 'is_live') return '直播中'
    if (video.live_status === 'is_upcoming') return '即將直播'
    return formatDuration(video.duration) || formatDuration(video.duration_string)
}
