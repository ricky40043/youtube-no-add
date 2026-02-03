import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

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

function VideoCard({ video }) {
    const navigate = useNavigate()

    const thumbnail = video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`

    const handleClick = () => {
        navigate(`/watch/${video.id}`)
    }

    return (
        <motion.div
            className="video-card"
            onClick={handleClick}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
        >
            <div className="video-thumbnail">
                <img
                    src={thumbnail}
                    alt={video.title}
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
                    }}
                />
                {video.duration && (
                    <span className="video-duration">
                        {formatDuration(video.duration)}
                    </span>
                )}
            </div>
            <div className="video-info">
                <h3 className="video-title">{video.title}</h3>
                <p className="video-author">{video.author}</p>
                <p className="video-meta">
                    {formatViews(video.view_count)}
                </p>
            </div>
        </motion.div>
    )
}

export default VideoCard
