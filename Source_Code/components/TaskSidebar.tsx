import { useState, useEffect } from 'react'
import { useToast } from '../hooks/useToast'
import CameraModal from './CameraModal'

const TASK_RETENTION_HOURS = 24 // Hours before completed tasks are deleted

const TASK_TITLE_PRESETS: Record<'task' | 'message', string[]> = {
    task: [
        'Regarding Prescription',
        'Regarding Visit',
        'Collect Payment',
        'File Report',
        'Schedule Follow-up',
        'Verify Insurance',
        'Update Patient Record',
        'Prepare Bill',
        'Lab Test Follow-up',
        'Appointment Reminder',
    ],
    message: [
        'Regarding Prescription',
        'Regarding Visit',
        'Patient Query',
        'Urgent Notice',
        'Schedule Change',
        'General Update',
        'Appointment Confirmation',
        'Lab Results Ready',
    ],
}

// Helper function to check if a completed task should be shown (not older than 24 hours)
const shouldShowCompletedTask = (task: Task): boolean => {
    if (task.status !== 'completed') return true
    if (!task.createdAt) return true
    
    // For completed tasks, check if they have a completedAt field
    // If not, use createdAt as fallback
    const completedTime = new Date(task.createdAt).getTime()
    const now = Date.now()
    const hoursOld = (now - completedTime) / (1000 * 60 * 60)
    return hoursOld < TASK_RETENTION_HOURS
}

interface Receptionist {
    id: number
    name: string
    email: string
    profileImage?: string
}

interface Task {
    id: number
    title: string
    description: string
    assignedTo: number | null
    assignedBy: number | null
    assignedByName?: string
    assignedToName?: string
    status: 'pending' | 'completed'
    type: 'task' | 'message'
    createdAt: string
    isSuggested?: boolean
    expiresAt?: string
    visitId?: number
    attachmentUrl?: string
    visit?: {
        id: number
        opdNo: string
        patient: {
            id: number
            firstName: string
            lastName: string
            phone?: string
        }
    }
}

interface TaskSidebarProps {
    isOpen: boolean
    onClose: () => void
}

export default function TaskSidebar({ isOpen, onClose }: TaskSidebarProps) {
    const [receptionists, setReceptionists] = useState<Receptionist[]>([])
    const [selectedReceptionists, setSelectedReceptionists] = useState<number[]>([])
    const [tasks, setTasks] = useState<Task[]>([])
    const [suggestedTasks, setSuggestedTasks] = useState<Task[]>([])
    const [activeTab, setActiveTab] = useState<'history' | 'in-progress' | 'suggested'>('suggested')
    const [taskType, setTaskType] = useState<'task' | 'message'>('task')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [receptionistsCached, setReceptionistsCached] = useState(false)
    const [pdfModalOpen, setPdfModalOpen] = useState(false)
    const [selectedPdfUrl, setSelectedPdfUrl] = useState<string>('')
    const [attachmentUrls, setAttachmentUrls] = useState<Array<{url: string, name: string}>>([])
    const [uploadingAttachment, setUploadingAttachment] = useState(false)
    const [cameraModalOpen, setCameraModalOpen] = useState(false)
    const [usedSuggestedTaskId, setUsedSuggestedTaskId] = useState<number | null>(null)
    const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null)
    const [extendingTaskId, setExtendingTaskId] = useState<number | null>(null)
    const [usingTaskId, setUsingTaskId] = useState<number | null>(null)
    const [showTitleDropdown, setShowTitleDropdown] = useState(false)
    const { showSuccess, showError, showInfo } = useToast()

    useEffect(() => {
        if (isOpen && !receptionistsCached) {
            fetchReceptionists()
        }
    }, [isOpen, receptionistsCached])

    useEffect(() => {
        if (selectedReceptionists.length > 0) {
            fetchAllSelectedTasks()
        } else {
            setTasks([])
        }
    }, [selectedReceptionists])

    useEffect(() => {
        if (isOpen) {
            fetchSuggestedTasks()
        }
    }, [isOpen])

    // Cache management for tasks
    useEffect(() => {
        const handleTaskUpdate = () => {
            if (selectedReceptionists.length > 0) {
                fetchAllSelectedTasks()
            }
            fetchSuggestedTasks()
        }
        window.addEventListener('task-updated', handleTaskUpdate)
        return () => window.removeEventListener('task-updated', handleTaskUpdate)
    }, [selectedReceptionists])

    const fetchReceptionists = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/users/receptionists')
            const data = await res.json()
            if (res.ok) {
                setReceptionists(data.receptionists || [])
                setReceptionistsCached(true)
                if (data.receptionists?.length > 0) {
                    setSelectedReceptionists([data.receptionists[0].id])
                }
            }
        } catch (error) {
        } finally {
            setLoading(false)
        }
    }

    const fetchAllSelectedTasks = async () => {
        try {
            const allTasks: Task[] = []
            for (const receptionistId of selectedReceptionists) {
                const res = await fetch(`/api/tasks/receptionist/${receptionistId}`)
                const data = await res.json()
                if (res.ok && data.tasks) {
                    allTasks.push(...data.tasks)
                }
            }
            // Filter out completed tasks older than 24 hours
            const filteredTasks = allTasks.filter(shouldShowCompletedTask)
            // Sort by creation date, newest first
            filteredTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            setTasks(filteredTasks)
        } catch (error) {
        }
    }

    const fetchSuggestedTasks = async () => {
        try {
            const res = await fetch('/api/tasks/suggested')
            const data = await res.json()
            if (res.ok) {
                setSuggestedTasks(data.tasks || [])
            }
        } catch (error) {
        }
    }

    const useSuggestedTask = async (task: Task) => {
        setUsingTaskId(task.id)
        try {
            setTitle(task.title)
            setDescription(task.description || '')
            setTaskType(task.type)
            setActiveTab('suggested')
            
            // Store the suggested task ID to delete it after assignment
            if (task.isSuggested && task.id) {
                setUsedSuggestedTaskId(task.id)
            }
            
            // If task has a visitId, fetch the visit to get the office copy PDF URL
            if (task.visitId) {
                try {
                    const res = await fetch(`/api/visits?id=${task.visitId}`)
                    const visitData = await res.json()
                    if (res.ok && visitData?.officeCopyPdfUrl) {
                        setAttachmentUrls([{
                            url: visitData.officeCopyPdfUrl,
                            name: `Prescription-${visitData.opdNo}.pdf`
                        }])
                        showSuccess('Task loaded with PDF attachment')
                    } else {
                        showSuccess('Task loaded into form')
                    }
                } catch (error) {
                    showSuccess('Task loaded into form')
                }
            } else {
                showSuccess('Task loaded into form')
            }
            
            // Keep showing success state for 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000))
        } finally {
            setUsingTaskId(null)
        }
    }

    const deleteSuggestedTask = async (taskId: number) => {
        setDeletingTaskId(taskId)
        try {
            const res = await fetch('/api/tasks/suggested', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: taskId })
            })
            
            const data = await res.json()
            
            if (res.ok) {
                fetchSuggestedTasks()
                showSuccess('Suggested task removed')
            } else if (res.status === 404) {
                // Task already deleted, refresh the list
                fetchSuggestedTasks()
                showError('Task was already deleted')
            } else {
                showError(data.error || 'Failed to remove suggested task')
            }
        } catch (error) {
            showError('Failed to remove suggested task')
        } finally {
            setDeletingTaskId(null)
        }
    }

    const extendExpiry = async (taskId: number, hours: number) => {
        setExtendingTaskId(taskId)
        try {
            const newExpiry = new Date()
            newExpiry.setHours(newExpiry.getHours() + hours)
            
            const res = await fetch('/api/tasks/suggested', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: taskId, expiresAt: newExpiry })
            })
            if (res.ok) {
                fetchSuggestedTasks()
                showSuccess(`Expiry extended by ${hours} hour(s)`)
            }
        } catch (error) {
            showError('Failed to extend expiry')
        } finally {
            setExtendingTaskId(null)
        }
    }

    const toggleReceptionistSelection = (receptionistId: number) => {
        setSelectedReceptionists(prev => {
            if (prev.includes(receptionistId)) {
                // If already selected, remove it
                return prev.filter(id => id !== receptionistId)
            } else {
                // If not selected, add it
                return [...prev, receptionistId]
            }
        })
    }

    const handleFileUpload = async (file: File) => {
        if (!file) return
        
        setUploadingAttachment(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            })
            
            const data = await res.json()
            if (res.ok && data.url) {
                setAttachmentUrls(prev => [...prev, {
                    url: data.url,
                    name: file.name
                }])
                showSuccess('File uploaded successfully')
            } else {
                showError('Failed to upload file')
            }
        } catch (error) {
            showError('Failed to upload file')
        } finally {
            setUploadingAttachment(false)
        }
    }

    const handleCameraCapture = async (imageData: string) => {
        try {
            setUploadingAttachment(true)
            // Convert base64 to blob
            const response = await fetch(imageData)
            const blob = await response.blob()
            const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
            await handleFileUpload(file)
        } catch (error) {
            showError('Failed to process camera image')
        } finally {
            setUploadingAttachment(false)
        }
    }

    const removeAttachment = (index: number) => {
        setAttachmentUrls(prev => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (selectedReceptionists.length === 0 || !title.trim()) {
            showError('Please select at least one receptionist and enter a title')
            return
        }

        setSubmitting(true)
        try {
            // Send to each selected receptionist
            const promises = selectedReceptionists.map(receptionistId =>
                fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        description,
                        assignedTo: receptionistId,
                        type: taskType,
                        attachmentUrl: attachmentUrls.length > 0 ? attachmentUrls[0].url : undefined // Send first attachment for now
                    })
                })
            )

            const results = await Promise.all(promises)
            const allSuccessful = results.every(res => res.ok)

            if (allSuccessful) {
                const count = selectedReceptionists.length
                showSuccess(
                    taskType === 'task' 
                        ? `Task assigned to ${count} receptionist${count > 1 ? 's' : ''} successfully` 
                        : `Message sent to ${count} receptionist${count > 1 ? 's' : ''} successfully`
                )
                
                // If this was a suggested task, delete it
                if (usedSuggestedTaskId) {
                    await deleteSuggestedTask(usedSuggestedTaskId)
                    setUsedSuggestedTaskId(null)
                }
                
                setTitle('')
                setDescription('')
                setAttachmentUrls([])
                fetchAllSelectedTasks()
                // Trigger cache refresh for tasks page
                window.dispatchEvent(new CustomEvent('task-updated'))
            } else {
                showError('Some assignments failed')
            }
        } catch (error) {
            showError('Failed to submit')
        } finally {
            setSubmitting(false)
        }
    }

    const toggleTaskStatus = async (taskId: number, currentStatus: string) => {
        try {
            const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })

            if (res.ok && selectedReceptionists.length > 0) {
                showSuccess('Task status updated')
                fetchAllSelectedTasks()
                // Trigger cache refresh for tasks page
                window.dispatchEvent(new CustomEvent('task-updated'))
            }
        } catch (error) {
            showError('Failed to update task status')
        }
    }

    if (!isOpen) return null

    return (
        <>
            {/* Overlay with blue tint */}
            <div 
                className={`fixed inset-0 bg-gradient-to-br from-black/60 via-blue-950/30 to-black/60 backdrop-blur-sm transition-all duration-500 ease-out z-40 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Sidebar with futuristic blue glow */}
            <div 
                className={`fixed right-0 top-0 h-full w-full sm:w-[550px] bg-gradient-to-br from-gray-900 via-gray-950 to-black shadow-2xl z-50 transform transition-all duration-500 ease-out flex flex-col ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} border-l-2 border-blue-500/30`}
                style={{
                    boxShadow: isOpen ? '-10px 0 50px rgba(59,130,246, 0.2), -5px 0 20px rgba(37,99,235, 0.3)' : 'none'
                }}
            >
                {/* Futuristic Header with blue glow */}
                <div className="sticky top-0 bg-gradient-to-r from-blue-950/90 via-gray-900/90 to-blue-950/90 backdrop-blur-xl border-b-2 border-blue-500/30 px-6 py-4 flex items-center justify-between z-10 shadow-lg shadow-blue-500/10">
                    <div>
                        <h2 className="text-lg font-bold bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50"></span>
                            Task Management
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                fetchSuggestedTasks()
                                if (selectedReceptionists.length > 0) {
                                    fetchAllSelectedTasks()
                                }
                                showSuccess('Tasks refreshed')
                            }}
                            className="group p-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all duration-300 text-blue-400 hover:text-blue-300"
                            title="Refresh tasks"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="group p-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all duration-300 text-blue-400 hover:text-blue-300 hover:rotate-90 hover:scale-110"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Receptionist Selection Boxes */}
                <div className="px-6 py-4 bg-gradient-to-br from-blue-950/50 via-gray-900/50 to-blue-950/50 border-b-2 border-blue-500/20">
                    <h3 className="text-xs font-medium text-blue-400/90 mb-3">Select Receptionist(s)</h3>
                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500/20 border-t-blue-500"></div>
                        </div>
                    ) : receptionists.length === 0 ? (
                        <div className="text-center py-4 text-xs text-blue-400/50">No receptionists found</div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {receptionists.map((receptionist) => {
                                const isSelected = selectedReceptionists.includes(receptionist.id)
                                return (
                                    <button
                                        key={receptionist.id}
                                        onClick={() => toggleReceptionistSelection(receptionist.id)}
                                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 flex items-center gap-2 ${
                                            isSelected
                                                ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30 border border-blue-400/50'
                                                : 'bg-gradient-to-br from-gray-800/50 to-gray-900/50 text-blue-300 border border-blue-500/30 hover:border-blue-500/50 hover:bg-gray-800/70 hover:shadow-lg hover:shadow-blue-500/10'
                                        }`}
                                    >
                                        {receptionist.profileImage ? (
                                            <img
                                                src={receptionist.profileImage}
                                                alt={receptionist.name}
                                                className="w-5 h-5 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                isSelected ? 'bg-white/20' : 'bg-blue-500/30 text-blue-400'
                                            }`}>
                                                {receptionist.name[0]?.toUpperCase()}
                                            </div>
                                        )}
                                        <span>{receptionist.name}</span>
                                        {isSelected && (
                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {selectedReceptionists.length > 0 && (
                    <>
                        {/* Futuristic Form */}
                        <div className="p-4 bg-gradient-to-br from-blue-950/50 via-gray-900/50 to-blue-950/50 border-b-2 border-blue-500/20">
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setTaskType('task')}
                                        className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                                            taskType === 'task'
                                                ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30'
                                                : 'bg-gray-900/50 text-blue-300 hover:bg-gray-800/70 border border-blue-500/30'
                                        }`}
                                    >
                                        Task
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTaskType('message')}
                                        className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                                            taskType === 'message'
                                                ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30'
                                                : 'bg-gray-900/50 text-blue-300 hover:bg-gray-800/70 border border-blue-500/30'
                                        }`}
                                    >
                                        Message
                                    </button>
                                </div>

                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onFocus={() => setShowTitleDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowTitleDropdown(false), 150)}
                                    placeholder={taskType === 'task' ? 'Task title' : 'Message subject'}
                                    className="w-full px-3 py-2 border-2 border-blue-500/30 rounded-lg bg-gray-900/50 text-blue-100 placeholder-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-xs"
                                    required
                                />

                                {/* Quick-pick title suggestions */}
                                {showTitleDropdown && (
                                    <div className="mt-1 rounded-lg border border-blue-500/30 bg-gray-900/95 backdrop-blur-md overflow-hidden shadow-xl shadow-black/40 z-20 relative">
                                        <p className="px-3 pt-2 pb-1 text-[10px] font-medium text-blue-400/70 uppercase tracking-wider">Quick select</p>
                                        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                                            {TASK_TITLE_PRESETS[taskType].map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault()
                                                        setTitle(preset)
                                                        setShowTitleDropdown(false)
                                                    }}
                                                    className="px-2.5 py-1 text-[11px] rounded-full bg-blue-500/15 hover:bg-blue-500/30 border border-blue-500/25 text-blue-300 hover:text-blue-200 transition-all duration-150 active:scale-95"
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder={taskType === 'task' ? 'Description (optional)' : 'Content (optional)'}
                                        className="w-full px-3 py-2 border-2 border-blue-500/30 rounded-lg text-xs resize-none bg-gray-900/50 text-blue-100 placeholder-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                                        rows={2}
                                    />
                                    
                                    {/* Attachment Controls */}
                                    <div className="flex items-center gap-2">
                                        <label className="flex-1 cursor-pointer">
                                            <input
                                                type="file"
                                                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                                className="hidden"
                                                accept="image/*,application/pdf"
                                            />
                                            <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs text-blue-400 transition-all duration-300 cursor-pointer">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                                </svg>
                                                <span>{uploadingAttachment ? 'Uploading...' : 'Attach File'}</span>
                                            </div>
                                        </label>
                                        
                                        <button
                                            type="button"
                                            onClick={() => setCameraModalOpen(true)}
                                            disabled={uploadingAttachment}
                                            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs text-blue-400 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span>Camera</span>
                                        </button>
                                    </div>
                                    
                                    {/* Show attached files as list */}
                                    {attachmentUrls.length > 0 && (
                                        <div className="space-y-1.5">
                                            {attachmentUrls.map((attachment, index) => (
                                                <div key={index} className="flex items-center justify-between px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs group hover:bg-blue-500/15 transition-all">
                                                    <div className="flex items-center gap-2 text-blue-300 flex-1 min-w-0">\n                                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        <a 
                                                            href={attachment.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="truncate hover:text-blue-600 underline"
                                                            title={attachment.name}
                                                        >
                                                            {attachment.name}
                                                        </a>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(index)}
                                                        className="ml-2 p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                                                        title="Remove attachment"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="group relative w-full px-3 py-2 bg-gradient-to-r from-blue-500 via-sky-500 to-blue-600 hover:from-blue-400 hover:via-sky-400 hover:to-blue-500 text-white rounded-lg transition-all duration-300 font-semibold text-xs shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] disabled:opacity-50"
                                >
                                    {submitting 
                                        ? 'Sending...' 
                                        : taskType === 'task' 
                                            ? `Assign to ${selectedReceptionists.length} Receptionist${selectedReceptionists.length > 1 ? 's' : ''}`
                                            : `Send to ${selectedReceptionists.length} Receptionist${selectedReceptionists.length > 1 ? 's' : ''}`
                                    }
                                </button>
                            </form>
                        </div>

                        {/* Futuristic Tabs */}
                        <div className="flex border-b-2 border-blue-500/20 bg-gradient-to-br from-gray-900/50 to-gray-950/50">
                            <button
                                onClick={() => setActiveTab('suggested')}
                                className={`flex-1 px-4 py-2 text-xs font-medium transition-all duration-300 ${
                                    activeTab === 'suggested'
                                        ? 'bg-gradient-to-r from-blue-500/20 to-sky-500/20 text-blue-400 border-b-2 border-blue-500 shadow-lg shadow-blue-500/20'
                                        : 'text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10'
                                }`}
                            >
                                Suggested ({suggestedTasks.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('in-progress')}
                                className={`flex-1 px-4 py-2 text-xs font-medium transition-all duration-300 ${
                                    activeTab === 'in-progress'
                                        ? 'bg-gradient-to-r from-blue-500/20 to-sky-500/20 text-blue-400 border-b-2 border-blue-500 shadow-lg shadow-blue-500/20'
                                        : 'text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10'
                                }`}
                            >
                                In Progress ({tasks.filter(t => t.status === 'pending').length})
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex-1 px-4 py-2 text-xs font-medium transition-all duration-300 ${
                                    activeTab === 'history'
                                        ? 'bg-gradient-to-r from-blue-500/20 to-sky-500/20 text-blue-400 border-b-2 border-blue-500 shadow-lg shadow-blue-500/20'
                                        : 'text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10'
                                }`}
                            >
                                History ({tasks.filter(t => t.status === 'completed').length})
                            </button>
                        </div>

                        {/* Tasks List */}
                        <div className="flex-1 overflow-y-auto p-3">
                            {activeTab === 'suggested' && (
                                <div className="space-y-2">
                                    {suggestedTasks.length === 0 ? (
                                        <div className="text-center py-8">
                                            <svg className="w-10 h-10 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                            </svg>
                                            <p className="text-gray-500 text-xs">No suggested tasks</p>
                                        </div>
                                    ) : (
                                        suggestedTasks.map((task) => {
                                            const isExpired = task.expiresAt && new Date(task.expiresAt) < new Date()
                                            const timeLeft = task.expiresAt ? Math.max(0, Math.floor((new Date(task.expiresAt).getTime() - new Date().getTime()) / (1000 * 60))) : null
                                            
                                            return (
                                                <div
                                                    key={task.id}
                                                    className={`bg-white border rounded-lg p-2.5 transition-colors hover:bg-gray-50 ${
                                                        isExpired ? 'border-red-300 opacity-60' : 'border-purple-300'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-purple-100 text-purple-700">
                                                                    Suggested
                                                                </span>
                                                                {isExpired ? (
                                                                    <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-red-100 text-red-700">
                                                                        Expired
                                                                    </span>
                                                                ) : timeLeft !== null && (
                                                                    <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-orange-100 text-orange-700">
                                                                        {timeLeft}m left
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h4 className="font-medium text-xs text-gray-900 mb-0.5">
                                                                {task.title}
                                                            </h4>
                                                            {task.description && (
                                                                <p className="text-[11px] text-gray-600 mb-1 whitespace-pre-wrap">
                                                                    {task.description}
                                                                </p>
                                                            )}
                                                            {task.visit && (
                                                                <div className="text-[10px] text-gray-500 mb-1">
                                                                    Patient: {[task.visit.patient.firstName, task.visit.patient.lastName].filter(Boolean).join(' ') || 'Unknown'} • OPD: {task.visit.opdNo}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        <button
                                                            onClick={() => useSuggestedTask(task)}
                                                            disabled={usingTaskId === task.id}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {usingTaskId === task.id ? (
                                                                <>
                                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24">
                                                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    Added
                                                                </>
                                                            ) : (
                                                                'Use Task'
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (task.attachmentUrl) {
                                                                    setSelectedPdfUrl(task.attachmentUrl)
                                                                    setPdfModalOpen(true)
                                                                } else if (task.visitId) {
                                                                    // Fetch visit to check if PDFs are generated
                                                                    try {
                                                                        const response = await fetch(`/api/visits?id=${task.visitId}`)
                                                                        const visitData = await response.json()
                                                                        
                                                                        if (visitData.officeCopyPdfUrl) {
                                                                            // PDF exists, show it
                                                                            setSelectedPdfUrl(visitData.officeCopyPdfUrl)
                                                                            setPdfModalOpen(true)
                                                                            // Update task in local state
                                                                            fetchSuggestedTasks()
                                                                        } else {
                                                                            // PDF not generated yet, show message
                                                                            showInfo('PDF is being generated. Opening visit page...')
                                                                            window.open(`/visits/${task.visitId}`, '_blank')
                                                                        }
                                                                    } catch (error) {
                                                                        showError('Failed to check PDF status')
                                                                    }
                                                                } else {
                                                                    showError('PDF not available')
                                                                }
                                                            }}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                                        >
                                                            View PDF
                                                        </button>
                                                        <button
                                                            onClick={() => extendExpiry(task.id, 1)}
                                                            disabled={extendingTaskId === task.id}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {extendingTaskId === task.id ? (
                                                                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                            ) : (
                                                                '+1h'
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => deleteSuggestedTask(task.id)}
                                                            disabled={deletingTaskId === task.id}
                                                            className="px-2 py-1 text-[10px] font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {deletingTaskId === task.id ? (
                                                                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                            ) : (
                                                                'Delete'
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )}

                            {activeTab === 'in-progress' && (
                                <div className="space-y-2">
                                    {tasks.filter(t => t.status === 'pending').length === 0 ? (
                                        <div className="text-center py-8">
                                            <svg className="w-10 h-10 mx-auto mb-2 text-gray-400 dark:text-blue-400/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p className="text-gray-500 dark:text-blue-400/40 text-xs">No tasks in progress</p>
                                        </div>
                                    ) : (
                                        tasks.filter(t => t.status === 'pending').map((task) => (
                                            <div
                                                key={task.id}
                                                className="bg-white border border-blue-200 rounded-lg p-2.5 transition-colors hover:bg-gray-50"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${
                                                                task.type === 'task'
                                                                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                                                                    : 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400'
                                                            }`}>
                                                                {task.type === 'task' ? 'Task' : 'Msg'}
                                                            </span>
                                                        </div>
                                                        <h4 className="font-medium text-xs text-gray-900 dark:text-blue-100 mb-0.5 truncate">
                                                            {task.title}
                                                        </h4>
                                                        {task.description && (
                                                            <p className="text-[11px] text-gray-600 dark:text-blue-400/50 mb-1 line-clamp-2">
                                                                {task.description}
                                                            </p>
                                                        )}
                                                        <div className="text-[10px] text-gray-500 dark:text-blue-400/40">
                                                            {task.assignedByName} • {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleTaskStatus(task.id, task.status)}
                                                        className="px-2 py-1 text-[10px] font-medium rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="space-y-2">
                                    {tasks.filter(t => t.status === 'completed').length === 0 ? (
                                        <div className="text-center py-8">
                                            <svg className="w-10 h-10 mx-auto mb-2 text-gray-400 dark:text-blue-400/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            <p className="text-gray-500 dark:text-blue-400/40 text-xs">No completed tasks</p>
                                        </div>
                                    ) : (
                                        tasks.filter(t => t.status === 'completed').map((task) => (
                                            <div
                                                key={task.id}
                                                className="bg-white border border-sky-200 rounded-lg p-2.5 transition-colors hover:bg-gray-50"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${
                                                                task.type === 'task'
                                                                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                                                                    : 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400'
                                                            }`}>
                                                                {task.type === 'task' ? 'Task' : 'Msg'}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400">
                                                                Done
                                                            </span>
                                                        </div>
                                                        <h4 className="font-medium text-xs text-gray-900 dark:text-blue-100 mb-0.5 truncate">
                                                            {task.title}
                                                        </h4>
                                                        {task.description && (
                                                            <p className="text-[11px] text-gray-600 dark:text-blue-400/50 mb-1 line-clamp-2">
                                                                {task.description}
                                                            </p>
                                                        )}
                                                        <div className="text-[10px] text-gray-500 dark:text-blue-400/40">
                                                            To: {task.assignedToName} • {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleTaskStatus(task.id, task.status)}
                                                        className="px-2 py-1 text-[10px] font-medium rounded bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 transition-all"
                                                    >
                                                        Undo
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* PDF Preview Modal - Futuristic Green Theme */}
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
                                        Office Copy Preview
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
                                            title="Office Copy PDF"
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

            <CameraModal
                isOpen={cameraModalOpen}
                onClose={() => setCameraModalOpen(false)}
                onCapture={handleCameraCapture}
                title="Capture Attachment"
            />
        </>
    )
}



