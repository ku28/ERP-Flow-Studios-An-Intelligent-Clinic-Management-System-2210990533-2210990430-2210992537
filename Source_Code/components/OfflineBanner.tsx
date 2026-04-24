import { useEffect, useState } from 'react'
import useOfflineMode from '../hooks/useOfflineMode'

export default function OfflineBanner() {
    const { isOnline, wasOffline, pendingSync, dismissReconnectMessage } = useOfflineMode()
    const [showBanner, setShowBanner] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null)

    useEffect(() => {
        setShowBanner(!isOnline || wasOffline)
    }, [isOnline, wasOffline])

    useEffect(() => {
        const handleSyncStart = () => {
            setSyncing(true)
            setSyncResult(null)
        }

        const handleSyncComplete = (event: any) => {
            setSyncing(false)
            setSyncResult(event.detail)
            
            // Auto-hide after successful sync
            if (event.detail.failed === 0) {
                setTimeout(() => {
                    dismissReconnectMessage()
                }, 3000)
            }
        }

        window.addEventListener('sync-offline-data', handleSyncStart)
        window.addEventListener('offline-sync-complete', handleSyncComplete)

        return () => {
            window.removeEventListener('sync-offline-data', handleSyncStart)
            window.removeEventListener('offline-sync-complete', handleSyncComplete)
        }
    }, [dismissReconnectMessage])

    const handleDismiss = () => {
        setShowBanner(false)
        dismissReconnectMessage()
    }

    const handleRetrySync = () => {
        const event = new CustomEvent('sync-offline-data')
        window.dispatchEvent(event)
    }

    if (!showBanner) return null

    return (
        <div className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
            showBanner ? 'translate-y-0' : '-translate-y-full'
        }`}>
            {!isOnline && (
                <div className="bg-amber-500 text-white px-4 py-2 shadow-lg">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium">You're offline</p>
                                <p className="text-xs opacity-90">Changes will be saved and synced when you reconnect</p>
                            </div>
                        </div>
                        {pendingSync > 0 && (
                            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
                                {pendingSync} pending
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isOnline && wasOffline && (
                <div className="bg-emerald-500 text-white px-4 py-2 shadow-lg">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            {syncing ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-medium">Syncing your changes...</p>
                                        <p className="text-xs opacity-90">{pendingSync} items remaining</p>
                                    </div>
                                </>
                            ) : syncResult ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-medium">Back online!</p>
                                        <p className="text-xs opacity-90">
                                            {syncResult.success > 0 && `${syncResult.success} changes synced`}
                                            {syncResult.failed > 0 && ` • ${syncResult.failed} failed`}
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-medium">Back online!</p>
                                        <p className="text-xs opacity-90">Your connection has been restored</p>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex items-center space-x-2">
                            {syncResult && syncResult.failed > 0 && (
                                <button
                                    onClick={handleRetrySync}
                                    className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
                                >
                                    Retry
                                </button>
                            )}
                            <button
                                onClick={handleDismiss}
                                className="p-1 hover:bg-white/20 rounded transition-colors"
                                aria-label="Dismiss"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
