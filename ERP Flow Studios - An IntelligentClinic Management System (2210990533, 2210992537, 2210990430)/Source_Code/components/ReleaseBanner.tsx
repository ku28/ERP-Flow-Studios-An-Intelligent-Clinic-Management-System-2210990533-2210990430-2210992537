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

interface ReleaseBannerProps {
    release: Release
    onDismiss: () => void
}

/**
 * Dismissible top banner for feature/improvement releases.
 * Slides down from the top with smooth animation.
 */
export default function ReleaseBanner({ release, onDismiss }: ReleaseBannerProps) {
    const [visible, setVisible] = useState(false)
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        // Slide in after a brief delay
        const timer = setTimeout(() => setVisible(true), 300)
        return () => clearTimeout(timer)
    }, [])

    const handleDismiss = () => {
        setVisible(false)
        setTimeout(() => onDismiss(), 300) // Wait for slide-out animation
    }

    const features = Array.isArray(release.features) ? release.features : []

    const bannerConfig: Record<string, { bg: string, border: string, text: string, badge: string, icon: JSX.Element }> = {
        feature: {
            bg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40',
            border: 'border-emerald-200 dark:border-emerald-800',
            text: 'text-emerald-800 dark:text-emerald-200',
            badge: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
            icon: (
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
            )
        },
        improvement: {
            bg: 'from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40',
            border: 'border-purple-200 dark:border-purple-800',
            text: 'text-purple-800 dark:text-purple-200',
            badge: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
            icon: (
                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
            )
        }
    }

    const config = bannerConfig[release.releaseType] || bannerConfig.improvement

    return (
        <div
            className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-300 ease-in-out ${
                visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
            }`}
        >
            <div className={`bg-gradient-to-r ${config.bg} border-b ${config.border} shadow-md`}>
                <div className="max-w-7xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex-shrink-0">
                                {config.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 ${config.badge} rounded-full text-xs font-bold uppercase tracking-wider`}>
                                        v{release.version}
                                    </span>
                                    <span className={`font-semibold text-sm ${config.text}`}>
                                        {release.title}
                                    </span>
                                    {release.description && (
                                        <span className="text-gray-500 dark:text-gray-400 text-sm hidden md:inline">
                                            — {release.description}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {features.length > 0 && (
                                <button
                                    onClick={() => setExpanded(!expanded)}
                                    className={`text-sm font-medium ${config.text} hover:underline hidden sm:inline-flex items-center gap-1`}
                                >
                                    {expanded ? 'Hide' : 'Details'}
                                    <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            )}
                            <Link
                                href="/updates"
                                className={`text-sm font-medium ${config.text} hover:underline hidden sm:inline`}
                                onClick={handleDismiss}
                            >
                                Changelog
                            </Link>
                            <button
                                onClick={handleDismiss}
                                className="p-1 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                title="Dismiss"
                            >
                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Expandable features list */}
                    {expanded && features.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {features.map((feature: string, index: number) => (
                                    <li key={index} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                        <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
