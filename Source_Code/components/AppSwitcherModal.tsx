import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'

interface AppSwitcherModalProps {
    isOpen: boolean
    onClose: () => void
    currentApp: 'website' | 'erp'
    user: any
}

export default function AppSwitcherModal({ isOpen, onClose, currentApp, user }: AppSwitcherModalProps) {
    const router = useRouter()
    const { user: authUser } = useAuth()
    const [clinic, setClinic] = useState<any>(null)
    const [clinicLoading, setClinicLoading] = useState(false)
    const [accessCode, setAccessCode] = useState('')
    const [accessCodeLoading, setAccessCodeLoading] = useState(false)
    const [accessCodeError, setAccessCodeError] = useState('')

    const isNativeCapacitorRuntime = () => {
        if (typeof window === 'undefined') return false
        const cap = (window as any).Capacitor
        if (!cap) return false
        if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform()
        if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
        return false
    }

    // Close modal on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEscape)
            return () => document.removeEventListener('keydown', handleEscape)
        }
    }, [isOpen, onClose])

    // Load clinic data when modal opens
    useEffect(() => {
        if (isOpen) {
            loadClinicData()
        }
    }, [isOpen])

    const loadClinicData = async () => {
        setClinicLoading(true)
        try {
            // Use AuthContext user instead of fetching /api/auth/me
            if (authUser?.clinic) {
                setClinic(authUser.clinic)
            } else {
                setClinic(null)
            }
        } catch (e) {
            setClinic(null)
        } finally {
            setClinicLoading(false)
        }
    }

    const handleAccessCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setAccessCodeError('')
        setAccessCodeLoading(true)

        if (accessCode.length !== 6 || !/^\d{6}$/.test(accessCode)) {
            setAccessCodeError('Access code must be a 6-digit number')
            setAccessCodeLoading(false)
            return
        }

        try {
            // Verify clinic exists
            const response = await fetch('/api/clinic/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId: accessCode })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Invalid access code')
            }

            // Store clinic ID in localStorage for persistent clinic session
            localStorage.setItem('clinicId', accessCode)
            localStorage.setItem('clinicName', data.clinic?.name || 'Clinic')

            // Check if there are saved accounts for this clinic and auto-restore the last active one
            const storageKey = `savedAccounts_${accessCode}`
            const savedAccountsStr = localStorage.getItem(storageKey)
            
            if (savedAccountsStr) {
                try {
                    const savedAccounts = JSON.parse(savedAccountsStr)
                    if (savedAccounts && savedAccounts.length > 0) {
                        // Sort by lastActive and get the most recent
                        const sortedAccounts = savedAccounts.sort((a: any, b: any) => b.lastActive - a.lastActive)
                        const lastActiveAccount = sortedAccounts[0]
                        
                        // Try to restore the session
                        const restoreResponse = await fetch('/api/auth/switch-session', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sessionToken: lastActiveAccount.sessionToken })
                        })
                        
                        if (restoreResponse.ok) {
                            // Session restored successfully, do full reload
                            window.location.href = lastActiveAccount.role === 'receptionist' ? '/patients' : '/dashboard'
                            return
                        }
                    }
                } catch (err) {
                    // Continue to normal login if restore fails
                }
            }

            // Full page reload to login page with clinicId
            window.location.href = `/login?clinicId=${accessCode}`
        } catch (err: any) {
            setAccessCodeError(err.message || 'Invalid access code')
            setAccessCodeLoading(false)
        }
    }

    if (!isOpen) return null

    const isNativeApp = typeof window !== 'undefined' && (!!(window as any).electronAPI || isNativeCapacitorRuntime())

    const handleWebsiteClick = () => {
        onClose()
        router.push('/')
    }

    const handleERPClick = async () => {
        onClose()
        let u = user || authUser

        if (u) {
            router.push('/dashboard')
        } else {
            router.push(`/login?next=${encodeURIComponent('/dashboard')}`)
        }
    }

    const modal = (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={onClose}
            style={{
                animation: 'fadeIn 0.2s ease-out'
            }}
        >
            <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

            <div
                className="relative max-w-2xl w-full"
                onClick={(e) => e.stopPropagation()}
                style={{
                    animation: 'slideUp 0.3s ease-out'
                }}
            >
                {/* Modal Card */}
                <div className="relative overflow-hidden rounded-2xl border border-blue-200/50 dark:border-blue-700 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-2xl shadow-blue-500/10">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>

                    {/* Header */}
                    <div className="relative border-b border-blue-200/50 dark:border-blue-700/50 px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Switch Application</h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Choose which app you want to use</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
                            aria-label="Close modal"
                        >
                            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="relative p-6">
                        <div className={`grid grid-cols-1 ${isNativeApp ? '' : 'md:grid-cols-2'} gap-4`}>
                            {/* Website Box - hidden in native apps */}
                            {!isNativeApp && (
                            <button
                                onClick={handleWebsiteClick}
                                className={`group relative overflow-hidden rounded-xl p-6 transition-all duration-300 ${currentApp === 'website'
                                        ? 'bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900 dark:to-sky-900 ring-2 ring-blue-500 shadow-xl shadow-blue-500/20'
                                        : 'bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-2 border-blue-200/50 dark:border-blue-700/50 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/10'
                                    }`}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                                <div className="relative flex flex-col items-center gap-4">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${currentApp === 'website'
                                            ? 'bg-gradient-to-br from-blue-500 to-sky-600 shadow-lg shadow-blue-500/30 scale-110'
                                            : 'bg-gradient-to-br from-blue-400 to-sky-500 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-500/30'
                                        }`}>
                                        <img
                                            src="/favicon.png"
                                            alt="Website Logo"
                                            className="w-10 h-10 object-contain"
                                        />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">ERP Flow Studios</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Public website & information</p>
                                    </div>
                                    {currentApp === 'website' && (
                                        <div className="absolute top-3 right-3">
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                                Active
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </button>
                            )}

                            {/* Clinic Box */}
                            {clinicLoading ? (
                                <div className="group relative overflow-hidden rounded-xl p-6 transition-all duration-300 bg-white dark:bg-gray-800 border-2 border-purple-200/50 dark:border-purple-700/50">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-pink-500/5 pointer-events-none"></div>
                                    <div className="relative flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-400 to-pink-500">
                                            <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Loading</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">Fetching clinic data...</p>
                                        </div>
                                    </div>
                                </div>
                            ) : !clinic ? (
                                <div className="group relative overflow-hidden rounded-xl p-6 transition-all duration-300 bg-white dark:bg-gray-800 border-2 border-purple-200/50 dark:border-purple-700/50">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-pink-500/5 pointer-events-none"></div>
                                    <div className="relative flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 bg-gradient-to-br from-purple-400 to-pink-500 shadow-lg shadow-purple-500/30">
                                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Access Clinic</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">Enter your 6-digit clinic code</p>
                                        </div>
                                        <form onSubmit={handleAccessCodeSubmit} className="w-full space-y-3">
                                            <div>
                                                <input
                                                    type="text"
                                                    value={accessCode}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                                                        setAccessCode(val)
                                                        setAccessCodeError('')
                                                    }}
                                                    placeholder="000000"
                                                    maxLength={6}
                                                    className="w-full px-4 py-2.5 text-center text-lg font-mono tracking-widest border-2 border-purple-200 dark:border-purple-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                                    disabled={accessCodeLoading}
                                                />
                                                {accessCodeError && (
                                                    <p className="mt-2 text-xs text-red-600 dark:text-red-400 text-center">{accessCodeError}</p>
                                                )}
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={accessCodeLoading || accessCode.length !== 6}
                                                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {accessCodeLoading ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                        <span>Logging in...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                                        </svg>
                                                        Login to Clinic
                                                    </>
                                                )}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ) : (
                                <div className="group relative overflow-hidden rounded-xl p-6 transition-all duration-300 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 ring-2 ring-purple-500 shadow-xl shadow-purple-500/20">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-pink-500/5 pointer-events-none"></div>
                                    
                                    {/* Edit Button - Top Left */}
                                    <button
                                        onClick={() => {
                                            onClose()
                                            router.push('/clinic-edit')
                                        }}
                                        className="absolute top-3 left-3 z-10 group/edit w-9 h-9 hover:w-auto hover:px-3 rounded-full hover:rounded-lg text-purple-600 dark:text-purple-400 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 border border-purple-200/50 dark:border-purple-700/50 shadow-sm hover:shadow-md flex items-center justify-center transition-all duration-300 ease-out overflow-hidden"
                                    >
                                        <svg className="w-4 h-4 flex-shrink-0 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        <span className="max-w-0 group-hover/edit:max-w-xs opacity-0 group-hover/edit:opacity-100 overflow-hidden transition-all duration-300 ease-out delay-75 group-hover/edit:delay-0 group-hover/edit:ml-2 text-sm font-medium whitespace-nowrap">
                                            Edit
                                        </span>
                                    </button>

                                    {/* Active Badge - Top Right */}
                                    <div className="absolute top-3 right-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500 text-white text-xs font-semibold rounded-full">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Active
                                        </span>
                                    </div>

                                    <div className="relative flex flex-col items-center gap-3">
                                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/30 scale-110">
                                            {clinic.iconUrl ? (
                                                <img
                                                    src={clinic.iconUrl}
                                                    alt={clinic.name}
                                                    className="w-10 h-10 object-contain rounded-lg"
                                                />
                                            ) : (
                                                <span className="text-2xl font-bold text-white">
                                                    {clinic.name?.[0]?.toUpperCase() || 'C'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{clinic.name}</h3>
                                            <p className="text-sm text-purple-600 dark:text-purple-400 font-mono">Code: {clinic.clinicId}</p>
                                        </div>
                                        
                                        {/* Open ERP and Logout on same line */}
                                        <div className="w-full flex gap-2">
                                            <button
                                                onClick={async () => {
                                                    onClose()
                                                    router.push('/dashboard')
                                                }}
                                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/30"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                Open ERP
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        // Clear clinic session
                                                        localStorage.removeItem('clinicId')
                                                        localStorage.removeItem('clinicName')
                                                        await fetch('/api/auth/logout', { method: 'POST' })
                                                        onClose()
                                                        const isApp = !!(window as any).electronAPI || isNativeCapacitorRuntime()
                                                        window.location.href = isApp ? '/login' : '/'
                                                    } catch (error) {
                                                    }
                                                }}
                                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                </svg>
                                                Logout
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-blue-200/50 dark:border-blue-700/50">
                            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                                Click on an app to switch. Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Esc</kbd> to close.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}


