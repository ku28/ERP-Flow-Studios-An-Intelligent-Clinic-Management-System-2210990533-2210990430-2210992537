import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useImportContext } from '../contexts/ImportContext'
import { useDoctor } from '../contexts/DoctorContext'

export default function ImportNotifications() {
    const [isOpen, setIsOpen] = useState(false)
    const [showCancelConfirm, setShowCancelConfirm] = useState(false)
    const [taskToCancel, setTaskToCancel] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const { tasks, clearCompletedTasks, cancelTask, removeTask } = useImportContext()
    const { selectedDoctorId } = useDoctor()
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Debug logging on mount
    useEffect(() => {
    }, [])

    // Debug logging
    useEffect(() => {
    }, [tasks])

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1)
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Filter helper: show tasks that match current doctor OR have no doctorId set (undefined = show to all)
    const matchesDoctor = (t: any) => 
        t.doctorId === undefined || t.doctorId === selectedDoctorId || (t.doctorId === null && selectedDoctorId === null)

    const activeTasks = tasks.filter(t => 
        (t.status === 'importing' || t.status === 'deleting' || t.status === 'generating') && 
        matchesDoctor(t)
    )
    const completedTasks = tasks.filter(t => 
        (t.status === 'success' || t.status === 'error' || t.status === 'cancelled') &&
        matchesDoctor(t)
    )
    const filteredTasks = tasks.filter(t => matchesDoctor(t))
    const hasNotifications = filteredTasks.length > 0

    const getTypeLabel = (type: string) => {
        return type.charAt(0).toUpperCase() + type.slice(1)
    }

    const getOperationLabel = (operation: string, status: string) => {
        if (operation === 'delete') {
            return status === 'deleting' ? 'Deleting' : 'Delete'
        }
        if (operation === 'generate') {
            return status === 'generating' ? 'Generating' : 'Generate'
        }
        return status === 'importing' ? 'Importing' : 'Import'
    }

    const getElapsedTime = (startTime: number, endTime?: number) => {
        const elapsed = (endTime || Date.now()) - startTime
        const seconds = Math.floor(elapsed / 1000)
        const minutes = Math.floor(seconds / 60)
        
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`
        }
        return `${seconds}s`
    }

    const getEstimatedTime = (task: any) => {
        if (task.progress.current === 0) return 'Calculating...'
        
        const elapsed = Date.now() - task.startTime
        const rate = task.progress.current / elapsed // items per ms
        const remaining = task.progress.total - task.progress.current
        const estimatedMs = remaining / rate
        
        const seconds = Math.floor(estimatedMs / 1000)
        const minutes = Math.floor(seconds / 60)
        
        if (minutes > 0) {
            return `~${minutes}m ${seconds % 60}s left`
        }
        return `~${seconds}s left`
    }

    const handleCancelTask = (taskId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setTaskToCancel(taskId)
        setShowCancelConfirm(true)
    }

    const confirmCancel = () => {
        if (taskToCancel) {
            cancelTask(taskToCancel)
        }
        setShowCancelConfirm(false)
        setTaskToCancel(null)
    }

    const handleTaskClick = (task: any) => {
        // Emit custom event to maximize the corresponding modal
        const event = new CustomEvent('maximizeTask', { detail: { taskId: task.id, type: task.type, operation: task.operation } })
        window.dispatchEvent(event)
        setIsOpen(false)
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    setIsOpen(!isOpen)
                }}
                className="relative p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                title="Import notifications"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {hasNotifications && activeTasks.length === 0 && (
                    <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                )}
                {activeTasks.length > 0 && (
                    <>
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                            {activeTasks.length}
                        </span>
                        {/* Spinning ring around bell when active tasks exist */}
                        <span className="absolute inset-0 rounded-lg border-2 border-blue-400 dark:border-blue-500 animate-pulse opacity-60 pointer-events-none"></span>
                    </>
                )}
            </button>

            {isOpen && (
                <div className="fixed top-14 right-4 w-96 rounded-lg border border-blue-200 dark:border-blue-700 bg-white/95 dark:bg-gray-900/95 shadow-xl shadow-blue-500/20 backdrop-blur-md z-[60] max-h-[500px] overflow-hidden flex flex-col animate-slideInFromRight">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 via-transparent to-sky-50/30 dark:from-blue-950/40 dark:via-transparent dark:to-sky-950/30 pointer-events-none rounded-lg"></div>
                    <div className="relative flex flex-col h-full">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                            Operations ({filteredTasks.length})
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleRefresh()
                                }}
                                className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                                title="Refresh notifications"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                            {completedTasks.length > 0 && (
                                <button
                                    onClick={clearCompletedTasks}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Clear Completed
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Task List */}
                    <div className="overflow-y-auto flex-1">
                        {filteredTasks.length === 0 ? (
                            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                                <p className="text-sm">No active operations</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredTasks.map((task) => (
                                    <div 
                                        key={task.id} 
                                        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                        onClick={() => (task.status === 'importing' || task.status === 'deleting' || task.status === 'generating') && handleTaskClick(task)}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                {(task.status === 'importing' || task.status === 'deleting' || task.status === 'generating') && (
                                                    <div className={`animate-spin rounded-full h-4 w-4 border-2 ${
                                                        task.operation === 'delete' 
                                                            ? 'border-red-600 border-t-transparent' 
                                                            : task.operation === 'generate'
                                                            ? 'border-blue-600 border-t-transparent'
                                                            : 'border-blue-600 border-t-transparent'
                                                    }`}></div>
                                                )}
                                                {task.status === 'success' && (
                                                    <svg className="w-4 h-4 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                                {task.status === 'error' && (
                                                    <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                )}
                                                {task.status === 'cancelled' && (
                                                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                    </svg>
                                                )}
                                                <span className="font-medium text-sm text-gray-900 dark:text-white">
                                                    {getOperationLabel(task.operation, task.status)} {getTypeLabel(task.type)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {(task.status === 'importing' || task.status === 'deleting' || task.status === 'generating') && (
                                                    <button
                                                        onClick={(e) => handleCancelTask(task.id, e)}
                                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                        title="Cancel operation"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                                {(task.status === 'success' || task.status === 'error' || task.status === 'cancelled') && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            removeTask(task.id)
                                                        }}
                                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                        title="Remove from list"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {getElapsedTime(task.startTime, task.endTime)}
                                                </span>
                                            </div>
                                        </div>

                                        {(task.status === 'importing' || task.status === 'deleting' || task.status === 'generating') && (
                                            <>
                                                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                    <span>{task.progress.current} / {task.progress.total}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span>{Math.round((task.progress.current / task.progress.total) * 100)}%</span>
                                                        <span className="text-gray-500">•</span>
                                                        <span>{getEstimatedTime(task)}</span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                                    <div
                                                        className={`h-1.5 rounded-full transition-all duration-300 ${
                                                            task.operation === 'delete'
                                                                ? 'bg-gradient-to-r from-red-500 to-red-600'
                                                                : task.operation === 'generate'
                                                                ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                                                                : 'bg-blue-600'
                                                        }`}
                                                        style={{ width: `${(task.progress.current / task.progress.total) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </>
                                        )}

                                        {task.status === 'success' && task.summary && (
                                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                                <span className="text-sky-600 dark:text-sky-400">
                                                    ✓ {task.summary.success} {task.operation === 'delete' ? 'deleted' : task.operation === 'generate' ? 'generated' : 'imported'}
                                                </span>
                                                {task.summary.skipped !== undefined && task.summary.skipped > 0 && (
                                                    <span className="text-yellow-600 dark:text-yellow-400 ml-2">
                                                        ⊘ {task.summary.skipped} skipped
                                                    </span>
                                                )}
                                                {task.summary.errors !== undefined && task.summary.errors > 0 && (
                                                    <span className="text-orange-600 dark:text-orange-400 ml-2">
                                                        ⚠ {task.summary.errors} failed
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {task.status === 'error' && task.error && (
                                            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                                {task.error}
                                            </div>
                                        )}

                                        {task.status === 'cancelled' && (
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                Operation cancelled by user
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal - Use Portal to render at body level */}
            {showCancelConfirm && typeof window !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 99999 }}>
                    <div className="rounded-lg border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-xl shadow-blue-500/10 backdrop-blur-sm p-6 max-w-md w-full mx-4 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-lg"></div>
                        <div className="relative">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    Cancel Operation
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                    Are you sure you want to cancel this operation? This action cannot be undone and progress will be lost.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setShowCancelConfirm(false)
                                            setTaskToCancel(null)
                                        }}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                        No, Continue
                                    </button>
                                    <button
                                        onClick={confirmCancel}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                    >
                                        Yes, Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}

