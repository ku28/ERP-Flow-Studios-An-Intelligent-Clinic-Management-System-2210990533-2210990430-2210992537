import { useState, useEffect, useCallback } from 'react'
import { OFFLINE_MODE_EVENT, getEffectiveOnlineState, isOfflineModeEnabled } from '../lib/offlineMode'

interface OfflineState {
    isOnline: boolean
    wasOffline: boolean
    pendingSync: number
    lastSyncTime: number | null
}

export default function useOfflineMode() {
    const [state, setState] = useState<OfflineState>({
        isOnline: getEffectiveOnlineState(),
        wasOffline: false,
        pendingSync: 0,
        lastSyncTime: null
    })

    // Update pending sync count
    const updatePendingCount = useCallback(() => {
        try {
            const queue = localStorage.getItem('offlineQueue')
            const count = queue ? JSON.parse(queue).length : 0
            setState(prev => ({ ...prev, pendingSync: count }))
        } catch {
            setState(prev => ({ ...prev, pendingSync: 0 }))
        }
    }, [])

    // Handle online status change
    const handleOnline = useCallback(() => {
        if (isOfflineModeEnabled()) {
            setState(prev => ({
                ...prev,
                isOnline: false,
                wasOffline: false
            }))
            return
        }

        setState(prev => ({
            ...prev,
            isOnline: true,
            wasOffline: !prev.isOnline // Only set wasOffline if we were actually offline
        }))
        
        // Trigger sync after coming back online
        if (!state.isOnline) {
            setTimeout(() => {
                const event = new CustomEvent('sync-offline-data')
                window.dispatchEvent(event)
            }, 1000) // Short delay to ensure connection is stable
        }
    }, [state.isOnline])

    const handleOffline = useCallback(() => {
        setState(prev => ({
            ...prev,
            isOnline: false
        }))
        
        // Show offline notification
        const event = new CustomEvent('show-offline-notification')
        window.dispatchEvent(event)
    }, [])

    const handleOfflineModeChanged = useCallback((event: Event) => {
        const detailEnabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled
        const enabled = typeof detailEnabled === 'boolean' ? detailEnabled : isOfflineModeEnabled()
        const online = typeof navigator !== 'undefined' ? navigator.onLine : true

        setState(prev => ({
            ...prev,
            isOnline: online && !enabled,
            wasOffline: enabled ? false : prev.wasOffline
        }))
    }, [])

    useEffect(() => {
        // Set initial online state
        if (typeof navigator !== 'undefined') {
            setState(prev => ({ ...prev, isOnline: getEffectiveOnlineState() }))
        }

        // Add event listeners
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        window.addEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)

        // Listen for queue updates
        const handleQueueUpdate = () => updatePendingCount()
        window.addEventListener('offline-queue-updated', handleQueueUpdate)

        // Listen for sync completion
        const handleSyncComplete = () => {
            setState(prev => ({
                ...prev,
                wasOffline: false,
                lastSyncTime: Date.now()
            }))
            updatePendingCount()
        }
        window.addEventListener('offline-sync-complete', handleSyncComplete)

        // Initial count
        updatePendingCount()

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            window.removeEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)
            window.removeEventListener('offline-queue-updated', handleQueueUpdate)
            window.removeEventListener('offline-sync-complete', handleSyncComplete)
        }
    }, [handleOnline, handleOffline, handleOfflineModeChanged, updatePendingCount])

    // Clear wasOffline flag
    const dismissReconnectMessage = useCallback(() => {
        setState(prev => ({ ...prev, wasOffline: false }))
    }, [])

    return {
        isOnline: state.isOnline,
        wasOffline: state.wasOffline,
        pendingSync: state.pendingSync,
        lastSyncTime: state.lastSyncTime,
        dismissReconnectMessage
    }
}
