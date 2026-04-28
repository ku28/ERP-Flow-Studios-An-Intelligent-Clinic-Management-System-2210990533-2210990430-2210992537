import { useState, useCallback } from 'react'
import type { Toast, ToastType } from '../components/ToastNotification'

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 11)
        const newToast: Toast = { id, message, type }
        setToasts((prev) => [...prev, newToast])
        return id
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    const showSuccess = useCallback((message: string) => addToast(message, 'success'), [addToast])
    const showError = useCallback((message: string) => addToast(message, 'error'), [addToast])
    const showWarning = useCallback((message: string) => addToast(message, 'warning'), [addToast])
    const showInfo = useCallback((message: string) => addToast(message, 'info'), [addToast])

    return {
        toasts,
        addToast,
        removeToast,
        showSuccess,
        showError,
        showWarning,
        showInfo
    }
}
