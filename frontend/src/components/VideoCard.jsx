import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import VideoDuration from './VideoDuration'
import { formatTimeAgo } from '../utils/date'

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
    // Keep compatibility with cached/legacy API responses that only contain
    // yt-dlp's upload_date field.
    const publishedDate = video.published_at || video.upload_date

    const handleClick = () => {
        if (video.channel_id && !video.id) {
            return
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
            whileHover={{ scale: 1.01 }}
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
                <VideoDuration video={video} />
            </div>
            <div className="video-info">
                <h3 className="video-title">
                    {video.title}
                </h3>
                <p className="video-author">{video.author}</p>
                <div className="video-meta">
                    <span>{formatViews(video.view_count)}</span>
                    {publishedDate && (
                        <>
                            <span>•</span>
                            <span>{formatTimeAgo(publishedDate)}</span>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

export default VideoCard
