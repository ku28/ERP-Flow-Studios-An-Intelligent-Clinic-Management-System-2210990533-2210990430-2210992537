import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Release {
    id: number
    version: string
    title: string
    description: string | null
    features: string[]
    releaseType: string
    isActive: boolean
    createdAt: string
}

interface VersionUpdateModalProps {
    release: Release
    onDismiss: () => void
}

/**
 * Full-screen centered modal for major releases.
 * Shown only for release_type = 'major'.
 * Data-driven from the database — no localStorage.
 */
export default function VersionUpdateModal({ release, onDismiss }: VersionUpdateModalProps) {
    const [showWhatsNew, setShowWhatsNew] = useState(false)
    const [closing, setClosing] = useState(false)

    // Lock body scroll when open
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    // Escape key to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [])

    const handleClose = () => {
        setClosing(true)
        setTimeout(() => {
            onDismiss()
        }, 200)
    }

    const features = Array.isArray(release.features) ? release.features : []

    const releaseTypeConfig: Record<string, { color: string, label: string, icon: JSX.Element }> = {
        major: {
            color: 'from-blue-500 to-sky-600',
            label: 'Major Release',
            icon: (
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            )
        },
        feature: {
            color: 'from-emerald-500 to-teal-600',
            label: 'New Features',
            icon: (
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
            )
        },
        improvement: {
            color: 'from-purple-500 to-indigo-600',
            label: 'Improvements',
            icon: (
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
            )
        }
    }

    const config = releaseTypeConfig[release.releaseType] || releaseTypeConfig.major

    return (
        <div 
            className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4 transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
            <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all duration-200 ${closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100 animate-scale-in'}`}>
                {!showWhatsNew ? (
                    <div className="p-8 text-center">
                        <div className={`w-16 h-16 bg-gradient-to-br ${config.color} rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/50`}>
                            {config.icon}
                        </div>
                        <div className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                            {config.label}
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            {release.title}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
                            Version {release.version}
                        </p>
                        {release.description && (
                            <p className="text-gray-600 dark:text-gray-400 mb-6 mt-3">
                                {release.description}
                            </p>
                        )}
                        {!release.description && <div className="mb-6" />}
                        <div className="flex flex-col gap-3">
                            {features.length > 0 && (
                                <button
                                    onClick={() => setShowWhatsNew(true)}
                                    className={`w-full px-6 py-3 bg-gradient-to-r ${config.color} hover:opacity-90 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/30 transition-all duration-200 transform hover:scale-105`}
                                >
                                    What's New
                                </button>
                            )}
                            <button
                                onClick={handleClose}
                                className="w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-all duration-200"
                            >
                                Got it!
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className={`bg-gradient-to-r ${config.color} px-6 py-4 flex items-center justify-between`}>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                                </svg>
                                What's New in v{release.version}
                            </h2>
                            <button onClick={handleClose} className="text-white hover:text-gray-200 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <ul className="space-y-3">
                                {features.map((feature: string, index: number) => (
                                    <li key={index} className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mt-0.5">
                                            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <span className="text-gray-700 dark:text-gray-300 flex-1">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                            <Link
                                href="/updates"
                                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-all duration-200 text-center text-sm"
                                onClick={handleClose}
                            >
                                Full Changelog
                            </Link>
                            <button
                                onClick={handleClose}
                                className={`flex-1 px-4 py-3 bg-gradient-to-r ${config.color} hover:opacity-90 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/30 transition-all duration-200 transform hover:scale-105`}
                            >
                                Got it!
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
