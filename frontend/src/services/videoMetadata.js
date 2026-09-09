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
        videoApi.getInfo(id)
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

export function getVideoMetadata(id) {
    const cached = cache.get(id)
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.info)
    if (pending.has(id)) return pending.get(id)

    const request = new Promise((resolve, reject) => queue.push({ id, resolve, reject }))
    pending.set(id, request)
    drainQueue()
    return request
}
