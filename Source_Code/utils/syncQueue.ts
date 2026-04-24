/**
 * Sync Queue Manager
 * Handles automatic syncing of offline operations when connection is restored
 */

import { syncOfflineQueue } from './offlineStorage'

let syncInProgress = false
let syncTimeout: NodeJS.Timeout | null = null

/**
 * Initialize sync queue listener
 * Should be called once when the app starts
 */
export function initializeSyncQueue(): void {
    // Listen for online events
    if (typeof window !== 'undefined') {
        window.addEventListener('sync-offline-data', handleSyncRequest)
    }
}

/**
 * Handle sync request
 */
async function handleSyncRequest(): Promise<void> {
    // Prevent concurrent syncs
    if (syncInProgress) {
        console.log('Sync already in progress, skipping...')
        return
    }

    // Check if actually online
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.log('Device is offline, skipping sync...')
        return
    }

    syncInProgress = true

    try {
        console.log('Starting offline data sync...')
        const result = await syncOfflineQueue()
        console.log(`Sync complete: ${result.success} succeeded, ${result.failed} failed`)
        
        // If there were failures, schedule a retry
        if (result.failed > 0) {
            scheduleRetry()
        }
    } catch (error) {
        console.error('Error during sync:', error)
        scheduleRetry()
    } finally {
        syncInProgress = false
    }
}

/**
 * Schedule a retry after failure
 */
function scheduleRetry(): void {
    // Clear existing timeout
    if (syncTimeout) {
        clearTimeout(syncTimeout)
    }

    // Retry after 30 seconds
    syncTimeout = setTimeout(() => {
        console.log('Retrying sync after failure...')
        const event = new CustomEvent('sync-offline-data')
        window.dispatchEvent(event)
    }, 30000)
}

/**
 * Manually trigger a sync
 */
export function triggerSync(): void {
    const event = new CustomEvent('sync-offline-data')
    window.dispatchEvent(event)
}

/**
 * Check if sync is currently in progress
 */
export function isSyncInProgress(): boolean {
    return syncInProgress
}

/**
 * Cleanup sync queue
 */
export function cleanupSyncQueue(): void {
    if (syncTimeout) {
        clearTimeout(syncTimeout)
        syncTimeout = null
    }
    window.removeEventListener('sync-offline-data', handleSyncRequest)
}
