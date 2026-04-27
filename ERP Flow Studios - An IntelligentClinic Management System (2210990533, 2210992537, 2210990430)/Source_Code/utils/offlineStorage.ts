/**
 * Offline Storage Utilities
 * Provides persistent storage for offline data with automatic syncing
 */

export interface OfflineQueueItem {
    id: string
    type: 'create' | 'update' | 'delete'
    endpoint: string
    data: any
    timestamp: number
    retries: number
}

export class OfflineStorage {
    private static QUEUE_KEY = 'offlineQueue'
    private static CACHE_PREFIX = 'offline_cache_'
    private static MAX_RETRIES = 3

    /**
     * Add an operation to the offline queue
     */
    static addToQueue(type: OfflineQueueItem['type'], endpoint: string, data: any): string {
        try {
            const queue = this.getQueue()
            const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            
            const item: OfflineQueueItem = {
                id,
                type,
                endpoint,
                data,
                timestamp: Date.now(),
                retries: 0
            }

            queue.push(item)
            localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue))
            
            // Dispatch event for UI updates
            const event = new CustomEvent('offline-queue-updated', { detail: { count: queue.length } })
            window.dispatchEvent(event)

            return id
        } catch (error) {
            console.error('Error adding to offline queue:', error)
            return ''
        }
    }

    /**
     * Get all queued operations
     */
    static getQueue(): OfflineQueueItem[] {
        try {
            const queue = localStorage.getItem(this.QUEUE_KEY)
            return queue ? JSON.parse(queue) : []
        } catch {
            return []
        }
    }

    /**
     * Remove an item from the queue
     */
    static removeFromQueue(id: string): void {
        try {
            const queue = this.getQueue().filter(item => item.id !== id)
            localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue))
            
            const event = new CustomEvent('offline-queue-updated', { detail: { count: queue.length } })
            window.dispatchEvent(event)
        } catch (error) {
            console.error('Error removing from offline queue:', error)
        }
    }

    /**
     * Increment retry count for a queued item
     */
    static incrementRetry(id: string): boolean {
        try {
            const queue = this.getQueue()
            const item = queue.find(i => i.id === id)
            
            if (!item) return false

            item.retries++
            
            // Remove if max retries exceeded
            if (item.retries >= this.MAX_RETRIES) {
                this.removeFromQueue(id)
                return false
            }

            localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue))
            return true
        } catch {
            return false
        }
    }

    /**
     * Clear all queued operations
     */
    static clearQueue(): void {
        try {
            localStorage.removeItem(this.QUEUE_KEY)
            const event = new CustomEvent('offline-queue-updated', { detail: { count: 0 } })
            window.dispatchEvent(event)
        } catch (error) {
            console.error('Error clearing offline queue:', error)
        }
    }

    /**
     * Cache data for offline access
     */
    static cacheData(key: string, data: any, expiryMinutes: number = 60): void {
        try {
            const cacheKey = this.CACHE_PREFIX + key
            const cacheItem = {
                data,
                timestamp: Date.now(),
                expiry: Date.now() + (expiryMinutes * 60 * 1000)
            }
            localStorage.setItem(cacheKey, JSON.stringify(cacheItem))
        } catch (error) {
            console.error('Error caching data:', error)
        }
    }

    /**
     * Get cached data
     */
    static getCachedData<T = any>(key: string): T | null {
        try {
            const cacheKey = this.CACHE_PREFIX + key
            const cached = localStorage.getItem(cacheKey)
            
            if (!cached) return null

            const cacheItem = JSON.parse(cached)
            
            // Check if expired
            if (Date.now() > cacheItem.expiry) {
                localStorage.removeItem(cacheKey)
                return null
            }

            return cacheItem.data as T
        } catch {
            return null
        }
    }

    /**
     * Clear all cached data
     */
    static clearCache(): void {
        try {
            const keys = Object.keys(localStorage)
            keys.forEach(key => {
                if (key.startsWith(this.CACHE_PREFIX)) {
                    localStorage.removeItem(key)
                }
            })
        } catch (error) {
            console.error('Error clearing cache:', error)
        }
    }

    /**
     * Get cache statistics
     */
    static getCacheStats(): { count: number; size: number } {
        try {
            const keys = Object.keys(localStorage).filter(key => key.startsWith(this.CACHE_PREFIX))
            let totalSize = 0
            
            keys.forEach(key => {
                const value = localStorage.getItem(key)
                if (value) {
                    totalSize += new Blob([value]).size
                }
            })

            return {
                count: keys.length,
                size: totalSize
            }
        } catch {
            return { count: 0, size: 0 }
        }
    }
}

/**
 * Sync offline queue when connection is restored
 */
export async function syncOfflineQueue(): Promise<{ success: number; failed: number }> {
    const queue = OfflineStorage.getQueue()
    
    if (queue.length === 0) {
        return { success: 0, failed: 0 }
    }

    let successCount = 0
    let failedCount = 0

    for (const item of queue) {
        try {
            const response = await fetch(item.endpoint, {
                method: item.type === 'delete' ? 'DELETE' : item.type === 'update' ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(item.data)
            })

            if (response.ok) {
                OfflineStorage.removeFromQueue(item.id)
                successCount++
            } else {
                const shouldRetry = OfflineStorage.incrementRetry(item.id)
                if (!shouldRetry) {
                    failedCount++
                }
            }
        } catch (error) {
            const shouldRetry = OfflineStorage.incrementRetry(item.id)
            if (!shouldRetry) {
                failedCount++
            }
        }
    }

    // Dispatch sync complete event
    const event = new CustomEvent('offline-sync-complete', {
        detail: { success: successCount, failed: failedCount }
    })
    window.dispatchEvent(event)

    return { success: successCount, failed: failedCount }
}
