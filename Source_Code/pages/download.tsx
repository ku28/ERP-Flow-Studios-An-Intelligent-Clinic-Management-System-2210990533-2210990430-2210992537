import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import LandingHeader from '../components/LandingHeader'
import FooterSection from '../components/modern-landing/Footer'
import WindowsInstallModal from '../components/WindowsInstallModal'
import AndroidInstallModal from '../components/AndroidInstallModal'

declare global {
    interface Window {
        electronAPI?: {
            quitApp?: () => void
            startUpdateDownload?: () => Promise<{ ok: boolean; error?: string }>
            checkForUpdates?: () => Promise<{ ok: boolean; error?: string }>
            onUpdaterEvent?: (callback: (payload: {
                event: 'checking-for-update' | 'update-available' | 'download-progress' | 'update-downloaded' | 'error'
                status?: string
                version?: string | null
                percent?: number
                error?: string
            }) => void) => () => void
        }
        Capacitor?: {
            getPlatform?: () => string
            Plugins?: {
                App?: {
                    getInfo?: () => Promise<{ version?: string }>
                }
                SpeechRecognition?: any
            }
        }
    }
}

export default function DownloadPage() {
    const router = useRouter()
    const [isAppEnvironment, setIsAppEnvironment] = useState(false)
    const [showIOSModal, setShowIOSModal] = useState(false)
    const [showWindowsModal, setShowWindowsModal] = useState(false)
    const [showAndroidModal, setShowAndroidModal] = useState(false)
    const [downloadUrls, setDownloadUrls] = useState({
        exe: 'https://www.dropbox.com/scl/fi/9elwpvfth48d89dgbn8ij/ERPFlowStudios-Setup.exe?rlkey=2rc9aycx944chgsoppqg49y4g&st=u9cm34jo&dl=0',
        apk: 'https://www.dropbox.com/scl/fi/4751feox64k87a8wa3fmi/ERPFlowStudios.apk?rlkey=rcg9ifgnnebcilh9jedv7re9j&st=0jksd5yg&dl=0',
    })

    useEffect(() => {
        // Block access from Electron (desktop exe) or Capacitor (Android apk) environments
        if (typeof window !== 'undefined') {
            const isElectron = !!window.electronAPI
            const cap = window.Capacitor as any
            const isNativeCapacitor = !!cap && (
                (typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()) ||
                (typeof cap?.getPlatform === 'function' && cap.getPlatform() !== 'web')
            )
            if (isElectron || isNativeCapacitor) {
                setIsAppEnvironment(true)
                router.replace('/dashboard')
                return
            }
        }
        // Fetch latest download URLs from version.json
        fetch('/version.json')
            .then(r => r.json())
            .then(data => {
                if (data.desktopDownloadUrl && data.androidDownloadUrl) {
                    setDownloadUrls({ exe: data.desktopDownloadUrl, apk: data.androidDownloadUrl })
                }
            })
            .catch(() => {})
    }, [router])

    if (isAppEnvironment) return null

    return (
        <>
            <Head>
                <title>Download - ERP Flow Studios</title>
                <meta name="description" content="Download ERP Flow Studios for Windows or Android." />
            </Head>

            <main className="min-h-screen bg-white dark:bg-[#0a0a0a] relative">
                <LandingHeader />
                {/* Background gradients matching hero section */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none overflow-hidden">
                    <div className="absolute top-32 left-10 w-96 h-96 bg-brand/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-50 animate-blob"></div>
                    <div className="absolute top-48 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-50 animate-blob animation-delay-2000"></div>
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-50 animate-blob animation-delay-4000"></div>
                </div>

                <section className="relative container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl pt-14 pb-24">
                    {/* Header */}
                    <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm">
                            <span className="px-2 py-0.5 rounded-full bg-brand text-white text-[10px] font-bold uppercase tracking-wide">Free</span>
                            <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Available on Windows &amp; Android</span>
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
                            Download{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-purple-600">
                                ERP Flow Studios
                            </span>
                        </h1>
                        <p className="text-lg text-gray-600 dark:text-gray-400">
                            Get the native app for the best experience on your device.
                        </p>
                    </div>

                    {/* Download Cards */}
                    <div className="flex flex-col md:flex-row items-stretch max-w-5xl mx-auto rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm">

                        {/* Windows EXE */}
                        <div className="group flex-1 flex flex-col items-center text-center gap-5 p-8 hover:bg-gray-50/80 dark:hover:bg-white/[0.04] transition-all duration-300">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand/10 to-purple-500/10 dark:from-brand/20 dark:to-purple-500/20 border border-brand/20 dark:border-brand/30 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                                <svg className="w-10 h-10 text-brand" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                                </svg>
                            </div>
                            <div className="flex flex-col items-center gap-3 flex-1">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Windows</h2>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                    Desktop app for Windows 10 / 11. Offline-capable with auto-updates.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 justify-center">
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">Windows 10+</span>
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">64-bit</span>
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">.exe installer</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowWindowsModal(true)}
                                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand hover:bg-brand/90 text-white font-semibold transition-all transform hover:scale-105 shadow-lg shadow-brand/25 text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download .exe
                            </button>
                        </div>

                        {/* Vertical divider (desktop) / Horizontal divider (mobile) */}
                        <div className="hidden md:flex flex-col items-center justify-center py-8">
                            <div className="flex-1 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest font-medium px-3 py-2">or</span>
                            <div className="flex-1 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                        </div>
                        <div className="md:hidden flex items-center gap-4 mx-8">
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest font-medium px-2">or</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                        </div>

                        {/* Android APK */}
                        <div className="group flex-1 flex flex-col items-center text-center gap-5 p-8 hover:bg-gray-50/80 dark:hover:bg-white/[0.04] transition-all duration-300">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 border border-green-500/20 dark:border-green-400/30 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                                <svg className="w-10 h-10 text-green-500 dark:text-green-400" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.523 15.342a.641.641 0 01-.641.642.641.641 0 01-.642-.642V10.8a.641.641 0 01.642-.641.641.641 0 01.641.641v4.542zm-10.406 0a.641.641 0 01-.642.642.641.641 0 01-.641-.642V10.8a.641.641 0 01.641-.641.641.641 0 01.642.641v4.542zM8.29 4.645L7.117 2.458a.233.233 0 00-.315-.099.234.234 0 00-.099.316l1.189 2.21A7.207 7.207 0 004.8 9.882h14.4a7.207 7.207 0 00-3.093-4.997l1.189-2.21a.234.234 0 00-.1-.316.233.233 0 00-.314.099L15.71 4.645A7.13 7.13 0 0012 3.664a7.13 7.13 0 00-3.71.981zM9.6 7.682a.641.641 0 11-1.282 0 .641.641 0 011.282 0zm6.082 0a.641.641 0 11-1.283 0 .641.641 0 011.283 0zM5.282 10.764v7.618a1.282 1.282 0 001.282 1.282h.641v2.695a.962.962 0 001.923 0v-2.695h1.745v2.695a.962.962 0 001.923 0v-2.695h.641a1.282 1.282 0 001.282-1.282v-7.618H5.282z" />
                                </svg>
                            </div>
                            <div className="flex flex-col items-center gap-3 flex-1">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Android</h2>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                    Mobile app for Android devices. Manage your clinic from anywhere.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 justify-center">
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">Android 8+</span>
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">.apk file</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAndroidModal(true)}
                                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold transition-all transform hover:scale-105 shadow-lg shadow-green-500/25 text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download .apk
                            </button>
                        </div>

                        {/* Vertical divider (desktop) / Horizontal divider (mobile) */}
                        <div className="hidden md:flex flex-col items-center justify-center py-8">
                            <div className="flex-1 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest font-medium px-3 py-2">or</span>
                            <div className="flex-1 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                        </div>
                        <div className="md:hidden flex items-center gap-4 mx-8">
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest font-medium px-2">or</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>
                        </div>

                        {/* iOS – PWA Install */}
                        <div className="group flex-1 flex flex-col items-center text-center gap-5 p-8 hover:bg-gray-50/80 dark:hover:bg-white/[0.04] transition-all duration-300">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-700/10 to-gray-900/10 dark:from-white/10 dark:to-white/5 border border-gray-300/60 dark:border-white/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                                <svg className="w-10 h-10 text-gray-700 dark:text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" />
                                </svg>
                            </div>
                            <div className="flex flex-col items-center gap-3 flex-1">
                                <div className="flex items-center gap-2 justify-center">
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">iPhone / iPad</h2>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 dark:bg-green-500/15 border border-green-200 dark:border-green-500/30 text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                                        Free
                                    </span>
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                    Install directly from Safari — no App Store or Apple account needed.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 justify-center">
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">iOS 16+</span>
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">Safari</span>
                                    <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-400">PWA</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowIOSModal(true)}
                                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#111827] hover:bg-[#1f2937] text-white font-semibold transition-all transform hover:scale-105 shadow-lg text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                How to Install on iPhone
                            </button>
                        </div>
                    </div>

                    {/* Footer note */}
                    <p className="text-center text-sm text-gray-400 dark:text-gray-600 mt-12">
                        Prefer the web?{' '}
                        <Link href="/" className="text-brand hover:underline font-medium">
                            Use ERP Flow Studios in your browser
                        </Link>
                        {' '}— no installation needed.
                    </p>
                </section>

                <FooterSection />
            </main>

            {/* iOS PWA Install Tutorial Modal */}
            {showIOSModal && (
                <div
                    className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowIOSModal(false) }}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Modal panel */}
                    <div className="relative w-full sm:max-w-md bg-white dark:bg-[#111] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
                        {/* Handle bar (mobile) */}
                        <div className="flex justify-center pt-3 pb-1 sm:hidden">
                            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-4 pb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#111827] flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Install on iPhone / iPad</h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Add to Home Screen in 4 steps</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                            >
                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Steps */}
                        <div className="px-6 py-4 space-y-4">
                            {/* Step 1 */}
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">1</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Open Safari</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Visit <span className="font-mono text-blue-500">erpflowstudios.com</span> in Safari. Chrome and other browsers don&apos;t support this.</p>
                                </div>
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
                                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 6L12 10.5 7.5 8 12 5.5 16.5 8zM7.5 16l4.5-2.5 4.5 2.5L12 18.5 7.5 16z" />
                                    </svg>
                                </div>
                            </div>

                            {/* Connector */}
                            <div className="ml-4 w-px h-3 bg-gray-200 dark:bg-gray-700" />

                            {/* Step 2 */}
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">2</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Tap the Share button</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tap the Share icon at the bottom of Safari — the box with an arrow pointing up.</p>
                                </div>
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                </div>
                            </div>

                            {/* Connector */}
                            <div className="ml-4 w-px h-3 bg-gray-200 dark:bg-gray-700" />

                            {/* Step 3 */}
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">3</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Tap &ldquo;Add to Home Screen&rdquo;</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Scroll down in the Share sheet and tap <span className="font-medium text-gray-700 dark:text-gray-300">Add to Home Screen</span>.</p>
                                </div>
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            </div>

                            {/* Connector */}
                            <div className="ml-4 w-px h-3 bg-gray-200 dark:bg-gray-700" />

                            {/* Step 4 */}
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">4</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Tap &ldquo;Add&rdquo; to confirm</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tap <span className="font-medium text-gray-700 dark:text-gray-300">Add</span> in the top-right corner. The app icon appears on your Home Screen!</p>
                                </div>
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Info banner */}
                        <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-start gap-3">
                            <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs text-blue-700 dark:text-blue-300">The app opens fullscreen like a native app with no browser navigation bar.</p>
                        </div>

                        {/* CTA */}
                        <div className="px-6 pb-6">
                            <a
                                href="https://erpflowstudios.com/app"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#111827] hover:bg-[#1f2937] text-white font-semibold transition-all text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Open in Safari
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Windows Install Modal */}
            <WindowsInstallModal 
                isOpen={showWindowsModal}
                onClose={() => setShowWindowsModal(false)}
                downloadUrl={downloadUrls.exe}
            />

            {/* Android Install Modal */}
            <AndroidInstallModal 
                isOpen={showAndroidModal}
                onClose={() => setShowAndroidModal(false)}
                downloadUrl={downloadUrls.apk}
            />
        </>
    )
}
