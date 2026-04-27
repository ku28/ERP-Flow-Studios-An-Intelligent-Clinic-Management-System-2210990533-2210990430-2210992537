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

const releaseTypeStyles: Record<string, { bg: string, text: string, dot: string, label: string }> = {
    major: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', label: 'Major Release' },
    feature: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', label: 'New Feature' },
    improvement: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500', label: 'Improvement' },
    bugfix: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', label: 'Bug Fix' },
    security: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500', label: 'Security' }
}

export default function UpdatesPage() {
    const [releases, setReleases] = useState<Release[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('all')

    useEffect(() => {
        fetchReleases()
    }, [])

    const fetchReleases = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/releases')
            if (res.ok) {
                const data = await res.json()
                setReleases(data)
            }
        } catch (error) {
        } finally {
            setLoading(false)
        }
    }

    const filteredReleases = filter === 'all'
        ? releases
        : releases.filter(r => r.releaseType === filter)

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Changelog
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-1 ml-8">
                    All updates and improvements to the application
                </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 mb-6 ml-8">
                {[
                    { value: 'all', label: 'All' },
                    { value: 'major', label: 'Major' },
                    { value: 'feature', label: 'Features' },
                    { value: 'improvement', label: 'Improvements' },
                    { value: 'bugfix', label: 'Bug Fixes' },
                    { value: 'security', label: 'Security' }
                ].map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => setFilter(tab.value)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                            filter === tab.value
                                ? 'bg-gradient-to-r from-blue-500 to-sky-600 text-white shadow-md'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Timeline */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : filteredReleases.length === 0 ? (
                <div className="text-center py-16">
                    <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500 dark:text-gray-400">No releases found</p>
                </div>
            ) : (
                <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 via-purple-300 to-sky-300 dark:from-blue-700 dark:via-purple-700 dark:to-sky-700"></div>

                    <div className="space-y-8">
                        {filteredReleases.map((release, index) => {
                            const style = releaseTypeStyles[release.releaseType] || releaseTypeStyles.improvement
                            const features = Array.isArray(release.features) ? release.features : []

                            return (
                                <div key={release.id} className="relative pl-12">
                                    {/* Timeline dot */}
                                    <div className={`absolute left-2.5 w-3.5 h-3.5 rounded-full ${style.dot} ring-4 ring-white dark:ring-gray-900 shadow-md`}
                                        style={{ top: '1.25rem' }}
                                    ></div>

                                    {/* Card */}
                                    <div className="rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
                                        <div className="p-5">
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <span className={`px-2.5 py-0.5 ${style.bg} ${style.text} rounded-full text-xs font-bold uppercase tracking-wider`}>
                                                            {style.label}
                                                        </span>
                                                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs font-mono font-bold">
                                                            v{release.version}
                                                        </span>
                                                    </div>
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                                        {release.title}
                                                    </h3>
                                                </div>
                                                <time className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap mt-1">
                                                    {formatDate(release.createdAt)}
                                                </time>
                                            </div>

                                            {/* Description */}
                                            {release.description && (
                                                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                                                    {release.description}
                                                </p>
                                            )}

                                            {/* Features */}
                                            {features.length > 0 && (
                                                <ul className="space-y-2">
                                                    {features.map((feature: string, fIdx: number) => (
                                                        <li key={fIdx} className="flex items-start gap-2.5 text-sm">
                                                            <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
