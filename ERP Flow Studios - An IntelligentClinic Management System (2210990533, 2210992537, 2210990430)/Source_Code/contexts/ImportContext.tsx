import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface ImportTask {
    id: string
    type: 'visits' | 'patients' | 'products' | 'treatments' | 'invoices'
    operation: 'import' | 'delete' | 'generate'
    status: 'importing' | 'deleting' | 'generating' | 'success' | 'error' | 'cancelled'
    progress: {
        current: number
        total: number
    }
    summary?: {
        success: number
        errors: number
        skipped?: number
    }
    error?: string
    startTime: number
    endTime?: number
    cancelled?: boolean
    doctorId?: number | null
}

interface ImportContextType {
    tasks: ImportTask[]
    addTask: (task: Omit<ImportTask, 'id' | 'startTime'>) => string
    updateTask: (id: string, updates: Partial<ImportTask>) => void
    removeTask: (id: string) => void
    cancelTask: (id: string) => void
    clearCompletedTasks: () => void
}

const ImportContext = createContext<ImportContextType | undefined>(undefined)

export function ImportProvider({ children }: { children: ReactNode }) {
    const [tasks, setTasks] = useState<ImportTask[]>(() => {
        // Load tasks from localStorage on initialization
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('importTasks')
                if (saved) {
                    const parsed = JSON.parse(saved)
                    return parsed
                }
            } catch (error) {
            }
        }
        return []
    })

    // Save tasks to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('importTasks', JSON.stringify(tasks))
            } catch (error) {
            }
        }
    }, [tasks])

    // Debug logging for all state changes
    useEffect(() => {
    }, [tasks])

    const addTask = (task: Omit<ImportTask, 'id' | 'startTime'>): string => {
        const id = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const newTask: ImportTask = {
            ...task,
            id,
            startTime: Date.now()
        }
        setTasks(prev => {
            const updated = [...prev, newTask]
            return updated
        })
        return id
    }

    const updateTask = (id: string, updates: Partial<ImportTask>) => {
        setTasks(prev => prev.map(task => 
            task.id === id ? { ...task, ...updates } : task
        ))
    }

    const removeTask = (id: string) => {
        setTasks(prev => prev.filter(task => task.id !== id))
    }

    const cancelTask = (id: string) => {
        setTasks(prev => prev.map(task => 
            task.id === id 
                ? { ...task, status: 'cancelled' as const, cancelled: true, endTime: Date.now() } 
                : task
        ))
    }

    const clearCompletedTasks = () => {
        setTasks(prev => prev.filter(task => task.status === 'importing' || task.status === 'deleting' || task.status === 'generating'))
    }

    return (
        <ImportContext.Provider value={{ tasks, addTask, updateTask, removeTask, cancelTask, clearCompletedTasks }}>
            {children}
        </ImportContext.Provider>
    )
}

export function useImportContext() {
    const context = useContext(ImportContext)
    if (!context) {
        throw new Error('useImportContext must be used within ImportProvider')
    }
    return context
}
