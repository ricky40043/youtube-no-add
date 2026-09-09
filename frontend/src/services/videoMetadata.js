import { videoApi } from './api'

// Only missing durations need a lookup. Share requests across cards and limit
// concurrency so scrolling through a large result set does not flood the API.
const cache = new Map()
const pending = new Map()
const queue = []
let active = 0

function drainQueue() {
    while (active < 3 && queue.length) {
        const { id, resolve, reject } = queue.shift()
        active += 1
        videoApi.getMetadata(id)
            .then(info => {
                if (cache.size >= 200) cache.delete(cache.keys().next().value)
                cache.set(id, { info, expires: Date.now() + 5 * 60 * 1000 })
                resolve(info)
            }, reject)
            .finally(() => {
                pending.delete(id)
                active -= 1
                drainQueue()
            })
    }
}

export function getVideoMetadata(id, { priority = false } = {}) {
    const cached = cache.get(id)
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.info)
    if (pending.has(id)) {
        if (priority) {
            const index = queue.findIndex(item => item.id === id)
            if (index > 0) queue.unshift(queue.splice(index, 1)[0])
        }
        return pending.get(id)
    }

    const request = new Promise((resolve, reject) => {
        const item = { id, resolve, reject }
        if (priority) queue.unshift(item)
        else queue.push(item)
    })
    pending.set(id, request)
    drainQueue()
    return request
}
