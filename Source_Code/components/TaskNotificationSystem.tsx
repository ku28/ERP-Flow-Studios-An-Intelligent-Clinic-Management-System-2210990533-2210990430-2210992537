import { useEffect, useState } from 'react'
import TaskNotificationModal from './TaskNotificationModal'

interface TaskNotificationSystemProps {
    userRole?: string
}

interface NewTask {
    id: number
    title: string
    description?: string
    assignedBy: string
    createdAt: string
}

export default function TaskNotificationSystem({ userRole }: TaskNotificationSystemProps) {
    const [newTask, setNewTask] = useState<NewTask | null>(null)
    const [checkInterval, setCheckInterval] = useState<NodeJS.Timeout | null>(null)
    const [isAcknowledging, setIsAcknowledging] = useState(false)
    const [acknowledgedTaskIds, setAcknowledgedTaskIds] = useState<Set<number>>(new Set())
    const [isProcessing, setIsProcessing] = useState(false)

    // Only run for receptionists
    const isReceptionist = userRole === 'receptionist'

    useEffect(() => {
        if (!isReceptionist) return

        // Check for new tasks immediately
        checkForNewTasks()

        // Set up polling every 5 seconds
        const interval = setInterval(checkForNewTasks, 5000)
        setCheckInterval(interval)

        return () => {
            if (interval) clearInterval(interval)
        }
    }, [isReceptionist])

    const checkForNewTasks = async () => {
        // Don't check if we're currently acknowledging a task
        if (isAcknowledging) return
        
        try {
            const response = await fetch('/api/tasks/notifications')
            const data = await response.json()

            if (data.hasNew && data.task && !isAcknowledging) {
                // Don't show if we've already acknowledged this task
                if (!acknowledgedTaskIds.has(data.task.id)) {
                    setNewTask(data.task)
                }
            }
        } catch (error) {
        }
    }

    const acknowledgeTask = async (taskId: number) => {
        setIsAcknowledging(true)
        
        // Add to acknowledged set immediately
        setAcknowledgedTaskIds(prev => {
            const newSet = new Set(prev)
            newSet.add(taskId)
            return newSet
        })
        
        try {
            const response = await fetch('/api/tasks/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId })
            })
            
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error('Failed to acknowledge')
            }
            
            // Trigger cache invalidation for tasks page
            window.dispatchEvent(new CustomEvent('task-updated'))
        } catch (error) {
            throw error // Re-throw to handle in parent
        } finally {
            // Reset processing state immediately
            setIsProcessing(false)
            // Wait before allowing new checks to ensure DB is updated
            setTimeout(() => {
                setIsAcknowledging(false)
            }, 2000)
        }
    }

    const handleAccept = async () => {
        if (!newTask || isProcessing) return
        setIsProcessing(true)
        
        try {
            await acknowledgeTask(newTask.id)
            setNewTask(null) // Clear after successful acknowledgment
        } catch (error) {
            setIsProcessing(false)
        }
    }

    const handleAddToQueue = async () => {
        if (!newTask || isProcessing) return
        setIsProcessing(true)
        
        try {
            await acknowledgeTask(newTask.id)
            setNewTask(null) // Clear after successful acknowledgment
        } catch (error) {
            setIsProcessing(false)
        }
    }

    if (!isReceptionist || !newTask) {
        return null
    }

    return (
        <TaskNotificationModal
            taskId={newTask.id}
            title={newTask.title}
            description={newTask.description}
            assignedBy={newTask.assignedBy}
            isProcessing={isProcessing}
            onAccept={handleAccept}
            onAddToQueue={handleAddToQueue}
        />
    )
}
