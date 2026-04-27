import { useState, useEffect, useRef } from 'react'

interface NotificationItem {
    id: string
    title: string
    message: string
    type: 'info' | 'success' | 'warning' | 'error'
    timestamp: Date
    read: boolean
}

interface NotificationCenterProps {
    isOpen: boolean
    onClose: () => void
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const panelRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isOpen, onClose])

    // Listen for custom notification events
    useEffect(() => {
        const handler = (e: CustomEvent) => {
            const { title, message, type } = e.detail || {}
            if (title) {
                setNotifications(prev => [{
                    id: Date.now().toString(),
                    title,
                    message: message || '',
                    type: type || 'info',
                    timestamp: new Date(),
                    read: false,
                }, ...prev].slice(0, 50))
            }
        }
        window.addEventListener('app-notification', handler as EventListener)
        return () => window.removeEventListener('app-notification', handler as EventListener)
    }, [])

    const unreadCount = notifications.filter(n => !n.read).length

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }

    const clearAll = () => {
        setNotifications([])
    }

    const typeColors = {
        info: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
        success: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
        warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
        error: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    }

    const typeIcons = {
        info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z',
        error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    }

    const formatTime = (date: Date) => {
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        if (diff < 60000) return 'Just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return date.toLocaleDateString()
    }

    if (!isOpen) return null

    return (
        <div ref={panelRef} className="fixed right-0 top-0 bottom-0 w-80 z-[70] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notifications</h2>
                    {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full">{unreadCount}</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {notifications.length > 0 && (
                        <>
                            <button onClick={markAllRead} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Mark all read">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button onClick={clearAll} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Clear all">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </>
                    )}
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <svg className="w-12 h-12 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        <span className="text-xs">No notifications</span>
                    </div>
                ) : (
                    notifications.map(n => (
                        <div key={n.id} className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 transition-colors ${!n.read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                            <div className="flex items-start gap-2.5">
                                <div className={`p-1 rounded-lg mt-0.5 ${typeColors[n.type]}`}>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={typeIcons[n.type]} />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{n.title}</div>
                                    {n.message && <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</div>}
                                    <div className="text-[10px] text-gray-400 mt-1">{formatTime(n.timestamp)}</div>
                                </div>
                                {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}