import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmationModalProps {
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    onCancel: () => void
    type?: 'danger' | 'warning' | 'info'
}

export default function ConfirmationModal({ 
    isOpen, 
    title, 
    message, 
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    onConfirm, 
    onCancel,
    type = 'warning'
}: ConfirmationModalProps) {
    const [step, setStep] = useState<1 | 2>(1)

    const destructiveByText = useMemo(() => {
        const content = `${title} ${message} ${confirmText}`.toLowerCase()
        return /(delete|remove|permanent|cannot be undone|irreversible)/.test(content)
    }, [title, message, confirmText])

    const isTwoStep = type === 'danger' || destructiveByText
    const showSecondStep = isTwoStep && step === 2

    useEffect(() => {
        if (isOpen) setStep(1)
    }, [isOpen, title, message])

    if (!isOpen) return null

    const colorClasses = {
        danger: {
            icon: 'text-red-500',
            iconBg: 'bg-red-100 dark:bg-red-900/30',
            button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800'
        },
        warning: {
            icon: 'text-yellow-500',
            iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
            button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 dark:bg-yellow-700 dark:hover:bg-yellow-800'
        },
        info: {
            icon: 'text-blue-500',
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 dark:bg-blue-700 dark:hover:bg-blue-800'
        }
    }

    const colors = colorClasses[type]

    const modal = (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4" style={{ zIndex: 200000 }}>
            <div className="relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm p-4 sm:p-6 w-full max-w-md animate-scaleIn">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                {/* Icon */}
                <div className="relative flex items-center justify-center mb-4">
                    <div className={`w-16 h-16 rounded-full ${colors.iconBg} flex items-center justify-center`}>
                        <svg className={`w-8 h-8 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
                    {showSecondStep ? 'Final Confirmation' : title}
                </h3>

                {/* Message */}
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 text-center mb-4 sm:mb-6">
                    {showSecondStep
                        ? 'This action is irreversible and will permanently remove data. Do you want to continue?'
                        : message}
                </p>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 text-sm sm:text-base">
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            if (isTwoStep && step === 1) {
                                setStep(2)
                                return
                            }
                            onConfirm()
                        }}
                        className={`flex-1 px-3 sm:px-4 py-2 sm:py-2.5 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 text-sm sm:text-base ${colors.button}`}>
                        {showSecondStep ? confirmText : (isTwoStep ? 'Review Impact' : confirmText)}
                    </button>
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') return modal
    return createPortal(modal, document.body)
}

