import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { useDataCache } from '../contexts/DataCacheContext'

interface Task {
    id: number
    title: string
    description: string
    type: 'task' | 'message'
    status: 'pending' | 'completed'
    assignedByName: string
    createdAt: string
    completedAt?: string
    attachmentUrl?: string
}

// Cache configuration
const TASKS_CACHE_KEY = 'tasks_list'
const CACHE_DURATION = 30000 // 30 seconds
const LAST_FETCH_KEY = 'tasks_last_fetch'
const TASK_RETENTION_HOURS = 24 // Hours before completed tasks are deleted

// Helper function to check if a completed task should be shown (not older than 24 hours)
const shouldShowCompletedTask = (task: Task): boolean => {
    if (task.status !== 'completed' || !task.completedAt) return true
    const completedTime = new Date(task.completedAt).getTime()
    const now = Date.now()
    const hoursOld = (now - completedTime) / (1000 * 60 * 60)
    return hoursOld < TASK_RETENTION_HOURS
}

export default function TasksPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()
    const [loading, setLoading] = useState(true)
    const [tasks, setTasks] = useState<Task[]>([])
    const [loadingTasks, setLoadingTasks] = useState(false)
    const [activeTab, setActiveTab] = useState<'in-progress' | 'completed'>('in-progress')
    const [pdfModalOpen, setPdfModalOpen] = useState(false)
    const [selectedPdfUrl, setSelectedPdfUrl] = useState<string>('')
    const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null)
    const [viewingPdfTaskId, setViewingPdfTaskId] = useState<number | null>(null)
    const [usingCache, setUsingCache] = useState(false)
    const { showSuccess, showError } = useToast()
    const { getCache, setCache, clearCache } = useDataCache()

    useEffect(() => {
        if (authLoading) return
        if (!user) {
            setLoading(false)
            return
        }
        setLoading(false)
        // Redirect if not receptionist
        if (user.role !== 'receptionist') {
            router.push('/dashboard')
        } else {
            fetchTasks()
        }
    }, [user, authLoading])

    // Listen for task updates to refresh cache
    useEffect(() => {
        const handleTaskUpdate = () => {
            clearCache(TASKS_CACHE_KEY)
            clearCache(LAST_FETCH_KEY)
            fetchTasks(true)
        }
        window.addEventListener('task-updated', handleTaskUpdate)
        return () => window.removeEventListener('task-updated', handleTaskUpdate)
    }, [])

    const fetchTasks = async (forceRefresh = false) => {
        try {
            // Check cache first if not forcing refresh
            if (!forceRefresh) {
                const cachedTasks = getCache<Task[]>(TASKS_CACHE_KEY)
                const lastFetch = getCache<number>(LAST_FETCH_KEY)
                const now = Date.now()
                
                // Use cache if it exists and is still valid
                if (cachedTasks && lastFetch && (now - lastFetch) < CACHE_DURATION) {
                    setTasks(cachedTasks)
                    setUsingCache(true)
                    return
                }
            }
            
            // Fetch from API
            setUsingCache(false)
            setLoadingTasks(true)
            const res = await fetch('/api/tasks')
            const data = await res.json()
            if (res.ok) {
                const fetchedTasks = (data.tasks || []).filter(shouldShowCompletedTask)
                setTasks(fetchedTasks)
                
                // Update cache
                setCache(TASKS_CACHE_KEY, fetchedTasks)
                setCache(LAST_FETCH_KEY, Date.now())
            }
        } catch (error) {
            
            // Try to use stale cache on error
            const cachedTasks = getCache<Task[]>(TASKS_CACHE_KEY)
            if (cachedTasks) {
                setTasks(cachedTasks)
                setUsingCache(true)
                showError('Using cached data - network error')
            }
        } finally {
            setLoadingTasks(false)
        }
    }

    const markTaskDone = async (taskId: number, currentStatus: string) => {
        setUpdatingTaskId(taskId)
        try {
            const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
            
            // If marking as completed, delete the PDF from Cloudinary
            const task = tasks.find(t => t.id === taskId)
            if (newStatus === 'completed' && task?.attachmentUrl) {
                try {
                    // Extract public_id from Cloudinary URL
                    const urlParts = task.attachmentUrl.split('/')
                    const fileWithExt = urlParts[urlParts.length - 1]
                    const publicId = `erp-flow-studios/prescriptions/${fileWithExt}`
                    
                    // Delete from Cloudinary
                    await fetch('/api/cloudinary/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ publicId })
                    })
                } catch (err) {
                    // Continue even if deletion fails
                }
            }
            
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })

            if (res.ok) {
                showSuccess(newStatus === 'completed' ? 'Task marked as done' : 'Task marked as pending')
                // Clear cache and force refresh
                clearCache(TASKS_CACHE_KEY)
                clearCache(LAST_FETCH_KEY)
                fetchTasks(true)
            } else {
                showError('Failed to update task')
            }
        } catch (error) {
            showError('Failed to update task')
        } finally {
            setUpdatingTaskId(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            </div>
        )
    }

    if (!user || user.role !== 'receptionist') {
        return null
    }

    return (
        <div>
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Tasks & Messages
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-gray-600 dark:text-gray-400">Your assigned tasks and messages</p>
                        {usingCache && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-full">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                                Cached
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => {
                        clearCache(TASKS_CACHE_KEY)
                        clearCache(LAST_FETCH_KEY)
                        fetchTasks(true)
                    }}
                    disabled={loadingTasks}
                    className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all text-blue-600 dark:text-blue-400 disabled:opacity-50"
                    title="Refresh tasks"
                >
                    <svg className={`w-5 h-5 ${loadingTasks ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex border-b border-blue-200/50 dark:border-blue-700/50">
                <button
                    onClick={() => setActiveTab('in-progress')}
                    className={`px-6 py-3 text-sm font-medium transition-all relative ${
                        activeTab === 'in-progress'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                >
                    In Progress ({tasks.filter(t => t.status === 'pending').length})
                    {activeTab === 'in-progress' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 to-sky-600" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('completed')}
                    className={`px-6 py-3 text-sm font-medium transition-all relative ${
                        activeTab === 'completed'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                >
                    Completed ({tasks.filter(t => t.status === 'completed').length})
                    {activeTab === 'completed' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 to-sky-600" />
                    )}
                </button>
            </div>

            <div className="grid gap-4">
                {/* Assigned Tasks Card */}
                <div className="rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {activeTab === 'in-progress' ? 'In Progress' : 'Completed'} Tasks & Messages
                    </h2>
                    {loadingTasks ? (
                        <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto"></div>
                        </div>
                    ) : tasks.filter(t => activeTab === 'in-progress' ? t.status === 'pending' : t.status === 'completed').length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No {activeTab === 'in-progress' ? 'in progress' : 'completed'} tasks or messages
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tasks.filter(t => activeTab === 'in-progress' ? t.status === 'pending' : t.status === 'completed').map(task => (
                                <div
                                    key={task.id}
                                    className={`p-4 rounded-lg border ${
                                        task.status === 'completed'
                                            ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800'
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                                    task.type === 'task'
                                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                }`}>
                                                    {task.type === 'task' ? 'Task' : 'Message'}
                                                </span>
                                                {task.status === 'completed' && (
                                                    <span className="px-2 py-1 text-xs font-medium rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                                                        Completed
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                                {task.title}
                                            </h3>
                                            {task.description && (
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                    {task.description}
                                                </p>
                                            )}
                                            <div className="text-xs text-gray-500 dark:text-gray-500">
                                                <span className="font-medium">Assigned by:</span> {task.assignedByName} • {new Date(task.createdAt).toLocaleDateString()} at {new Date(task.createdAt).toLocaleTimeString()}
                                            </div>
                                            {task.attachmentUrl && task.status !== 'completed' && (
                                                <button
                                                    onClick={() => {
                                                        setViewingPdfTaskId(task.id)
                                                        setSelectedPdfUrl(task.attachmentUrl!)
                                                        setPdfModalOpen(true)
                                                        // Clear loading state after modal opens
                                                        setTimeout(() => setViewingPdfTaskId(null), 500)
                                                    }}
                                                    disabled={viewingPdfTaskId === task.id}
                                                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50"
                                                >
                                                    {viewingPdfTaskId === task.id ? (
                                                        <>
                                                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Loading...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                            </svg>
                                                            View PDF
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            {task.attachmentUrl && task.status === 'completed' && (
                                                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                    PDF Deleted
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => markTaskDone(task.id, task.status)}
                                            disabled={updatingTaskId === task.id}
                                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                                                task.status === 'completed'
                                                    ? 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
                                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {updatingTaskId === task.id ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Processing...
                                                </>
                                            ) : (
                                                task.status === 'completed' ? 'Undo' : 'Mark as Done'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* PDF Preview Modal */}
            {pdfModalOpen && (
                <>
                    <div 
                        className="fixed inset-0 bg-gradient-to-br from-blue-900/50 via-sky-900/50 to-cyan-900/50 backdrop-blur-md z-[9999]"
                        onClick={() => setPdfModalOpen(false)}
                    />
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-6">
                        <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-blue-500/30 w-[210mm] max-w-[95vw] h-[95vh] flex flex-col overflow-hidden">
                            {/* Glowing border effect */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-sky-500/20 to-cyan-500/20 blur-xl -z-10" />
                            
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-800/90 to-gray-900/90 border-b border-blue-500/20 backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                    <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-sky-400 bg-clip-text text-transparent">
                                        Attachment Preview
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={selectedPdfUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-sky-600 rounded-lg hover:from-blue-500 hover:to-sky-500 transition-all duration-300 shadow-lg hover:shadow-blue-500/50"
                                    >
                                        <span className="relative z-10 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            Open in New Tab
                                        </span>
                                        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-400 to-sky-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                                    </a>
                                    <button
                                        onClick={() => setPdfModalOpen(false)}
                                        className="group relative p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all duration-300"
                                    >
                                        <svg className="w-5 h-5 text-red-400 group-hover:text-red-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            
                            {/* PDF Viewer - A4 aspect ratio */}
                            <div className="flex-1 overflow-hidden relative bg-gray-950/50">
                                {selectedPdfUrl ? (
                                    <div className="w-full h-full flex items-center justify-center p-4">
                                        <iframe
                                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(selectedPdfUrl)}&embedded=true`}
                                            className="w-full h-full rounded-lg shadow-2xl"
                                            title="Attachment PDF"
                                            style={{ 
                                                border: '1px solid rgba(6, 182, 212, 0.3)',
                                                aspectRatio: '1 / 1.414' // A4 ratio
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                        <div className="relative mb-6">
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-sky-500/20 rounded-full blur-2xl" />
                                            <svg className="w-20 h-20 text-blue-400/50 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <h4 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-sky-400 bg-clip-text text-transparent mb-3">
                                            PDF Not Available
                                        </h4>
                                        <p className="text-sm text-gray-400">The PDF hasn't been generated yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}


