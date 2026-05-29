
/**
 * Formats a date string or timestamp into a relative time string (e.g., "5 hours ago").
 * Supports Traditional Chinese.
 * @param {string|number|Date} dateInput - The date to format.
 * @returns {string} The relative time string.
 */
export function formatTimeAgo(dateInput) {
    if (!dateInput) return '';

    let date;
    
    // Handle Unix timestamp (seconds or milliseconds)
    if (typeof dateInput === 'number') {
        // If less than 1e11, it's seconds; otherwise milliseconds
        const timestamp = dateInput < 1e11 ? dateInput * 1000 : dateInput;
        date = new Date(timestamp);
    }
    // Handle yt-dlp format: YYYYMMDD (e.g., "20240115")
    else if (typeof dateInput === 'string' && /^\d{8}$/.test(dateInput)) {
        const year = parseInt(dateInput.substring(0, 4));
        const month = parseInt(dateInput.substring(4, 6)) - 1;
        const day = parseInt(dateInput.substring(6, 8));
        date = new Date(year, month, day);
    } else {
        date = new Date(dateInput);
    }
    
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) {
        return '剛剛';
    } else if (minutes < 60) {
        return `${minutes} 分鐘前`;
    } else if (hours < 24) {
        return `${hours} 小時前`;
    } else if (days < 30) {
        return `${days} 天前`;
    } else if (months < 12) {
        return `${months} 個月前`;
    } else {
        return `${years} 年前`;
    }
}
