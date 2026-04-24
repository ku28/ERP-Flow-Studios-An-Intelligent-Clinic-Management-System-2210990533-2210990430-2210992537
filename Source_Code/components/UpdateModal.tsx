import { useEffect, useState } from 'react'
import type { Platform } from '../hooks/useVersionCheck'

interface UpdateModalProps {
    currentVersion: string
    latestVersion: string
    downloadUrl?: string
    platform: Platform
    statusMessage?: string
    progressPercent?: number
    isDownloading?: boolean
    isInstalling?: boolean
    onDesktopUpdate?: () => void
    onDismiss: () => void
}

export default function UpdateModal({
    currentVersion,
    latestVersion,
    downloadUrl,
    platform,
    statusMessage,
    progressPercent = 0,
    isDownloading = false,
    isInstalling = false,
    onDesktopUpdate,
    onDismiss,
}: UpdateModalProps) {
    const [closing, setClosing] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [copied, setCopied] = useState(false)

    // Lock body scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    // Escape to dismiss
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleDismiss() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleDismiss = () => {
        setClosing(true)
        setTimeout(onDismiss, 200)
    }

    const handleUpdate = () => {
        if (platform === 'desktop' && onDesktopUpdate) {
            onDesktopUpdate()
            return
        }

        if (!downloadUrl) {
            return
        }

        setDownloading(true)

        // Web / Android: trigger normal browser download
        const anchor = document.createElement('a')
        anchor.href = downloadUrl
        anchor.download = ''
        anchor.rel = 'noopener noreferrer'
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        setDownloading(false)
        handleDismiss()
    }

    const handleCopyLink = async () => {
        if (!downloadUrl) return

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(downloadUrl)
            } else {
                const input = document.createElement('input')
                input.value = downloadUrl
                document.body.appendChild(input)
                input.select()
                document.execCommand('copy')
                document.body.removeChild(input)
            }

            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        } catch {
            // Ignore clipboard failures silently; primary update action still works.
        }
    }

    const isDesktop = platform === 'desktop'
    const isDesktopAutoUpdater = isDesktop && !!onDesktopUpdate
    const desktopBusy = isDownloading || isInstalling
    const effectiveProgress = Math.max(0, Math.min(100, Math.round(progressPercent)))

    return (
        <div
            className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4 transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
            onClick={(e) => { if (e.target === e.currentTarget) handleDismiss() }}
        >
            <div
                className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transition-all duration-200 ${closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
            >
                {/* Header gradient */}
                <div className="bg-gradient-to-br from-blue-500 to-sky-600 p-6 text-center">
                    <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white">Update Available</h2>
                    <p className="text-blue-100 text-sm mt-1">ERP Flow Studios {latestVersion}</p>
                </div>

                {/* Body */}
                <div className="p-6 text-center">
                    <p className="text-gray-700 dark:text-gray-300 text-sm mb-1">
                        A new version of <span className="font-semibold">ERP Flow Studios</span> is available.
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mb-5">
                        You are on <span className="font-mono">{currentVersion}</span> — latest is{' '}
                        <span className="font-mono text-blue-600 dark:text-blue-400">{latestVersion}</span>
                    </p>

                    {isDesktop ? (
                        <>
                            {isDesktopAutoUpdater ? (
                                <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 mb-4">
                                    Updates are installed automatically in-app. Your app will restart when ready.
                                </p>
                            ) : (
                                <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 mb-4">
                                    Your desktop app is outdated. Download and install the latest setup to update.
                                </p>
                            )}

                            <div className="mb-5 text-left">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                        {statusMessage || 'Ready to download update'}
                                    </p>
                                    {isDesktopAutoUpdater && (
                                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                            {effectiveProgress}%
                                        </p>
                                    )}
                                </div>
                                {isDesktopAutoUpdater && (
                                    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-sky-500 transition-all duration-300"
                                            style={{ width: `${effectiveProgress}%` }}
                                        />
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleUpdate}
                                disabled={isDesktopAutoUpdater && desktopBusy}
                                className="w-full bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-md shadow-blue-500/30"
                            >
                                {isDesktopAutoUpdater && desktopBusy ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        {isInstalling ? 'Installing…' : 'Downloading…'}
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        {isDesktopAutoUpdater ? 'Update Now' : 'Download Latest Setup'}
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleDismiss}
                                disabled={isDesktopAutoUpdater && desktopBusy}
                                className="mt-3 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Remind me later
                            </button>

                            {!isDesktopAutoUpdater && !!downloadUrl && (
                                <button
                                    onClick={handleCopyLink}
                                    className="mt-2 w-full text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm py-2 transition-colors"
                                >
                                    {copied ? 'Download link copied' : 'Copy download link'}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleUpdate}
                                disabled={downloading || !downloadUrl}
                                className="w-full bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-md shadow-blue-500/30"
                            >
                                {downloading ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Opening…
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Update Now
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleDismiss}
                                disabled={downloading}
                                className="mt-3 w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Remind me later
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
