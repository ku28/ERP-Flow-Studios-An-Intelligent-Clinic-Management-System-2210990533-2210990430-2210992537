import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
    id: string
    message: string
    type: ToastType
}

interface ToastNotificationProps {
    toasts: Toast[]
    removeToast: (id: string) => void
}

export default function ToastNotification({ toasts, removeToast }: ToastNotificationProps) {
    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none mobile-safe-toast-stack">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
            ))}
        </div>
    )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true)
            setTimeout(() => onRemove(toast.id), 300) // Wait for exit animation
        }, 4000) // Show for 4 seconds

        return () => clearTimeout(timer)
    }, [toast.id, onRemove])

    const getToastStyles = () => {
        switch (toast.type) {
            case 'success':
                return 'bg-sky-500 border-sky-600'
            case 'error':
                return 'bg-red-500 border-red-600'
            case 'warning':
                return 'bg-yellow-500 border-yellow-600'
            case 'info':
                return 'bg-blue-500 border-blue-600'
            default:
                return 'bg-gray-500 border-gray-600'
        }
    }

    const getIcon = () => {
        switch (toast.type) {
            case 'success':
                return '✓'
            case 'error':
                return '✕'
            case 'warning':
                return '⚠'
            case 'info':
                return 'ℹ'
            default:
                return '•'
        }
    }

    return (
        <div
            className={`
                pointer-events-auto
                min-w-[300px] max-w-md
                px-4 py-3
                rounded-lg
                border-2
                text-white
                shadow-lg
                flex items-start gap-3
                transition-all duration-300
                ${getToastStyles()}
                ${isExiting ? 'translate-x-[400px] opacity-0' : 'translate-x-0 opacity-100'}
            `}
            style={{
                animation: isExiting ? 'slideOut 0.3s ease-in' : 'slideIn 0.3s ease-out'
            }}
        >
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold">
                {getIcon()}
            </div>
            <div className="flex-1 pt-0.5">
                <p className="text-sm font-medium leading-tight">{toast.message}</p>
            </div>
            <button
                onClick={() => {
                    setIsExiting(true)
                    setTimeout(() => onRemove(toast.id), 300)
                }}
                className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
                aria-label="Close notification"
            >
                ✕
            </button>
        </div>
    )
}

