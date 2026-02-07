import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { formatTimeAgo } from '../utils/date'

function formatDuration(seconds) {
    if (!seconds) return ''
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatViews(count) {
    if (!count) return ''
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M 次觀看`
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K 次觀看`
    }
    return `${count} 次觀看`
}

function VideoCard({ video, type = 'vertical' }) {
    const navigate = useNavigate()

    const thumbnail = video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`

    const handleClick = () => {
        if (video.channel_id && !video.id) {
            // It's a channel link? No, currently VideoCard is for videos.
            // But if we reuse it for generic items, be careful.
        }
        navigate(`/watch/${video.id}`)
    }

    const isHorizontal = type === 'horizontal'

    return (
        <motion.div
            className={`video-card ${isHorizontal ? 'horizontal' : ''}`}
            onClick={handleClick}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
            style={isHorizontal ? {
                display: 'flex',
                gap: '8px',
                marginBottom: '8px',
                cursor: 'pointer'
            } : {}}
        >
            <div className="video-thumbnail" style={isHorizontal ? { width: '160px', height: '90px', flexShrink: 0 } : {}}>
                <img
                    src={thumbnail}
                    alt={video.title}
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
                    }}
                    style={isHorizontal ? { height: '100%' } : {}}
                />
                {video.duration && (
                    <span className="video-duration" style={isHorizontal ? { fontSize: '10px', padding: '1px 3px' } : {}}>
                        {formatDuration(video.duration)}
                    </span>
                )}
            </div>
            <div className="video-info" style={isHorizontal ? { padding: 0, flex: 1 } : {}}>
                <h3 className="video-title" style={isHorizontal ? { fontSize: '0.9rem', marginBottom: '4px', lineHeight: '1.2' } : {}}>
                    {video.title}
                </h3>
                <p className="video-author" style={isHorizontal ? { fontSize: '0.8rem' } : {}}>{video.author}</p>
                <div className="video-meta" style={isHorizontal ? { fontSize: '0.75rem' } : {}}>
                    <span>{formatViews(video.view_count)}</span>
                    {video.published_at && (
                        <>
                            <span style={{ margin: '0 4px' }}>•</span>
                            <span>{formatTimeAgo(video.published_at)}</span>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

export default VideoCard
