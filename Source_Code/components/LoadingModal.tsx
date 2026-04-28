import React from 'react'
import { createPortal } from 'react-dom'

interface LoadingModalProps {
    isOpen: boolean
    message?: string
}

export default function LoadingModal({ isOpen, message = 'Loading...' }: LoadingModalProps) {
    if (!isOpen) return null

    const modal = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn">
            <div className="rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl shadow-blue-500/10 backdrop-blur-sm p-8 flex flex-col items-center space-y-6 min-w-[320px] overflow-hidden animate-scaleIn">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                <div className="relative w-full flex flex-col items-center space-y-6">
                {/* Modern Spinner Animation */}
                <div className="relative w-20 h-20">
                    {/* Outer rotating circle */}
                    <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-900/50 rounded-full"></div>
                    
                    {/* Main rotating spinner */}
                    <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin"></div>
                    
                    {/* Inner pulsing dot */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse"></div>
                    </div>
                    
                    {/* Secondary rotating ring */}
                    <div className="absolute inset-0 border-4 border-transparent border-b-blue-300 dark:border-b-blue-600 rounded-full animate-spin-slow"></div>
                </div>
                
                {/* Message */}
                <div className="text-center space-y-2">
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{message}</p>
                    <div className="flex items-center justify-center space-x-1">
                        <span className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                </div>
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') return modal
    return createPortal(modal, document.body)
}

