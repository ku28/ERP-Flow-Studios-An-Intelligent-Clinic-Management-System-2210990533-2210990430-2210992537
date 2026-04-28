import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import CustomSelect from '../components/CustomSelect'
import ToastNotification from '../components/ToastNotification'
import { useToast } from '../hooks/useToast'

// ─── Helper Components ──────────────────────────────────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10 sm:py-16">
            <div className="w-full max-w-lg">{children}</div>
        </div>
    )
}

function Dots() {
    return (
        <div className="flex gap-1">
            {[0, 150, 300].map(d => (
                <div key={d} className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
        </div>
    )
}

function ToggleEye({ show, onToggle }: { show: boolean; onToggle: () => void }) {
    return (
        <button type="button" tabIndex={-1} onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {show
                ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            }
        </button>
    )
}

export default function SignupPage() {
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [role, setRole] = useState('')
    const [roleOptions, setRoleOptions] = useState<any[]>([])
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [loading, setLoading] = useState(false)
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false)
    const router = useRouter()
    const { toasts, removeToast, showError, showWarning } = useToast()
    
    // Registration status (idle → pending → activating → activated)
    const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'pending' | 'activating' | 'activated'>('idle')
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
    const [resendLoading, setResendLoading] = useState(false)
    const [resendMessage, setResendMessage] = useState('')
    const [statusError, setStatusError] = useState('')
    
    // Clinic info state
    const [clinicName, setClinicName] = useState('ERP Flow Studios')
    const [clinicCode, setClinicCode] = useState('')
    const [clinicIcon, setClinicIcon] = useState('')
    const [loadingClinic, setLoadingClinic] = useState(true)
    const [clinicInputError, setClinicInputError] = useState('')
    const [clinicVerified, setClinicVerified] = useState(false)
    
    useEffect(() => {
        document.body.classList.add('auth-page')
        return () => { document.body.classList.remove('auth-page') }
    }, [])

    useEffect(() => {
        if (!router.isReady) return
        const googleStatus = typeof router.query.google === 'string' ? router.query.google : ''
        if (!googleStatus) return

        const messages: Record<string, string> = {
            failed: 'Google authentication was cancelled or failed. Please try again.',
            token_failed: 'Google authentication failed while exchanging token.',
            email_unverified: 'Your Google email is not verified. Please use a verified Google account.',
            no_account: 'No account found with this Google email. Complete signup form first.',
            clinic_mismatch: 'This Google account is not part of the selected clinic.',
            invalid_clinic: 'Invalid clinic selected for Google sign-in.',
            server_error: 'Google sign-in failed due to a server issue. Please try again.',
            not_configured: 'Google sign-in is not configured yet. Please contact admin.',
        }

        showError(messages[googleStatus] || 'Google sign-in failed. Please try again.')
        const clinicId = typeof router.query.clinicId === 'string' ? router.query.clinicId : ''
        const nextQuery = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ''
        router.replace(`/signup${nextQuery}`, undefined, { shallow: true })
    }, [router.isReady, router.query.google, router.query.clinicId])

    useEffect(() => {
        return () => { if (pollingInterval) clearInterval(pollingInterval) }
    }, [pollingInterval])

    useEffect(() => {
        const fetchClinicInfo = async () => {
            const clinicIdFromUrl = router.query.clinicId as string
            if (clinicIdFromUrl) {
                try {
                    const res = await fetch('/api/clinic/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clinicId: clinicIdFromUrl })
                    })
                    if (res.ok) {
                        const data = await res.json()
                        setClinicName(data.clinic.name)
                        setClinicCode(clinicIdFromUrl)
                        setClinicIcon(data.clinic.iconUrl || '')
                        setClinicVerified(true)
                    }
                } catch (error) {}
                finally { setLoadingClinic(false) }
            } else {
                setLoadingClinic(false)
            }
        }
        fetchClinicInfo()
    }, [router.query])

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                setLoadingOptions(true)
                const roleData = await fetch('/api/options/role').then(r => r.json()).catch(() => [])
                if (roleData.length === 0) {
                    const roleJSON = (await import('../data/role.json')).default
                    setRoleOptions(roleJSON)
                } else {
                    setRoleOptions(roleData)
                }
            } catch (error) {
                try {
                    const roleJSON = (await import('../data/role.json')).default
                    setRoleOptions(roleJSON)
                } catch (fallbackError) {}
            } finally {
                setLoadingOptions(false)
            }
        }
        fetchOptions()
    }, [])

    // ─── Polling ──────────────────────────────────────────────────────────────
    const startPolling = (emailToCheck: string) => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/auth/check-pending-status?email=${encodeURIComponent(emailToCheck)}`)
                const data = await response.json()
                if (data.status === 'approved') {
                    clearInterval(interval)
                    setPollingInterval(null)
                    setRegistrationStatus('activating')
                    setTimeout(() => {
                        setRegistrationStatus('activated')
                    }, 2000)
                } else if (data.status === 'expired') {
                    clearInterval(interval)
                    setPollingInterval(null)
                    setRegistrationStatus('idle')
                    showError('Registration request has expired. Please sign up again.')
                } else if (data.status === 'not_found') {
                    // Could mean it was approved and deleted from pending — check if user exists
                    clearInterval(interval)
                    setPollingInterval(null)
                    setRegistrationStatus('activating')
                    setTimeout(() => {
                        setRegistrationStatus('activated')
                    }, 2000)
                }
            } catch {}
        }, 5000)
        setPollingInterval(interval)
    }

    // ─── Resend verification ──────────────────────────────────────────────────
    const handleResendVerification = async () => {
        setResendLoading(true)
        setResendMessage('')
        setStatusError('')
        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to resend verification email')
            setResendMessage('Verification email resent to admins.')
        } catch (err: any) {
            setStatusError(err.message || 'Failed to resend verification email')
        } finally {
            setResendLoading(false)
        }
    }

    async function submit(e: any) {
        e.preventDefault()
        
        if (!role) {
            showWarning('Please select a role')
            return
        }

        if (!clinicVerified && !clinicCode) {
            showError('Please enter and verify clinic access code')
            return
        }

        const clinicIdToUse = (router.query.clinicId as string) || clinicCode
        
        setLoading(true)
        const res = await fetch('/api/auth/signup', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ email, name, password, role, clinicId: clinicIdToUse }) 
        })
        setLoading(false)
        
        const data = await res.json()
        
        if (res.ok) {
            setRegistrationStatus('pending')
            startPolling(email)
        } else {
            showError(data.error || 'Signup failed')
        }
    }

    async function handleClinicCodeSubmit() {
        if (!clinicCode.trim()) {
            setClinicInputError('Please enter clinic access code')
            return
        }

        try {
            setClinicInputError('')
            setLoadingClinic(true)
            const res = await fetch('/api/clinic/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId: clinicCode.trim() })
            })
            
            if (res.ok) {
                const data = await res.json()
                setClinicName(data.clinic.name)
                setClinicIcon(data.clinic.iconUrl || '')
                setClinicVerified(true)
                setClinicInputError('')
            } else {
                setClinicInputError('Invalid clinic access code')
                setClinicVerified(false)
            }
        } catch (error) {
            setClinicInputError('Error verifying clinic')
            setClinicVerified(false)
        } finally {
            setLoadingClinic(false)
        }
    }

    const handleGoogleAuth = () => {
        const clinicIdFromQuery = router.query.clinicId as string
        const clinicIdToUse = clinicIdFromQuery || clinicCode || ''
        const params = new URLSearchParams({ from: 'signup' })
        if (clinicIdToUse) params.set('clinicId', clinicIdToUse)
        window.location.href = `/api/auth/google-start?${params.toString()}`
    }

    useEffect(() => {
        if (!router.isReady) return
        const googleStatus = typeof router.query.google === 'string' ? router.query.google : ''
        if (!googleStatus) return

        const messages: Record<string, string> = {
            failed: 'Google sign-up was cancelled or failed. Please try again.',
            deleted_client: 'Google sign-in client is invalid or deleted. Please contact admin to update Google OAuth credentials.',
            token_failed: 'Google authentication failed while exchanging token.',
            email_unverified: 'Your Google email is not verified. Please use a verified Google account.',
            invalid_clinic: 'Invalid clinic selected for Google sign-up.',
            server_error: 'Google sign-up failed due to a server issue. Please try again.',
            not_configured: 'Google sign-up is not configured yet. Please contact admin.',
        }

        showError(messages[googleStatus] || 'Google sign-up failed. Please try again.')
        const clinicId = typeof router.query.clinicId === 'string' ? router.query.clinicId : ''
        const nextQuery = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ''
        router.replace(`/signup${nextQuery}`, undefined, { shallow: true })
    }, [router.isReady, router.query.google, router.query.clinicId])

    // ─── Activating State ─────────────────────────────────────────────────────
    if (registrationStatus === 'activating') return (
        <PageShell>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-12 text-center">
                <div className="w-16 h-16 mx-auto rounded-full border-4 border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400 animate-spin" />
                <p className="mt-6 text-lg font-semibold text-gray-700 dark:text-gray-300">Activating your account…</p>
            </div>
        </PageShell>
    )

    // ─── Pending State ────────────────────────────────────────────────────────
    if (registrationStatus === 'pending') return (
        <>
            <Head><title>Pending Approval — Staff Registration</title></Head>
            <PageShell>
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 max-w-lg mx-auto">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-5">
                            <svg className="w-10 h-10 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pending Admin Approval</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                            Your registration has been submitted. A verification email has been sent to the clinic admins.
                        </p>

                        <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-5 mb-4 text-left">
                            <div className="flex items-center gap-3 mb-3">
                                {clinicIcon && (
                                    <img src={clinicIcon} alt={clinicName} className="w-10 h-10 rounded-lg object-cover" />
                                )}
                                <div>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">Clinic</p>
                                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{clinicName}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg px-3 py-2">
                                    <p className="text-gray-500 dark:text-gray-400">Name</p>
                                    <p className="font-semibold text-gray-800 dark:text-gray-200">{name}</p>
                                </div>
                                <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg px-3 py-2">
                                    <p className="text-gray-500 dark:text-gray-400">Role</p>
                                    <p className="font-semibold text-gray-800 dark:text-gray-200 capitalize">{role}</p>
                                </div>
                            </div>
                        </div>

                        <div className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 mb-4 text-left">
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">Email</p>
                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400 break-all">{email}</p>
                        </div>

                        {statusError && (
                            <div className="w-full mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                                {statusError}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleResendVerification}
                            disabled={resendLoading}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
                        >
                            {resendLoading
                                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.582 9A7.974 7.974 0 014 12c0 4.418 3.582 8 8 8" /></svg>
                            }
                            Resend Verification Email
                        </button>
                        {resendMessage && <p className="mt-3 text-sm text-green-600 dark:text-green-400">{resendMessage}</p>}

                        <div className="flex items-center gap-2 mt-6 text-gray-400 text-sm">
                            <Dots />
                            Waiting for approval…
                        </div>
                    </div>
                </div>
            </PageShell>
        </>
    )

    // ─── Activated State ──────────────────────────────────────────────────────
    if (registrationStatus === 'activated') return (
        <>
            <Head><title>Account Approved — Staff Registration</title></Head>
            <PageShell>
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 max-w-lg mx-auto">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-5">
                            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Approved!</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your account has been verified. You can now log in.</p>

                        <div className="w-full bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-400 rounded-2xl p-6 mb-6">
                            <p className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase tracking-widest mb-2">Welcome</p>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{email}</p>
                        </div>

                        <button
                            onClick={() => router.push(clinicVerified || clinicCode ? `/login?clinicId=${clinicCode || router.query.clinicId}` : '/clinic-login')}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-500/30"
                        >
                            Go to Login
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </button>
                    </div>
                </div>
            </PageShell>
        </>
    )

    // ─── Registration Form ────────────────────────────────────────────────────
    return (
        <>
            <Head><title>Staff Registration</title></Head>
            <ToastNotification toasts={toasts} removeToast={removeToast} />
            <div className="min-h-[70vh] flex items-center justify-center px-3 sm:px-4 py-6 sm:py-8">
                <div className="max-w-md w-full">
                    <div className={`relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-xl shadow-blue-500/5 backdrop-blur-sm p-5 sm:p-7 overflow-hidden ${isRoleDropdownOpen ? 'z-[10000]' : 'z-0'}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                        <div className="relative">

                        {/* Clinic Info Display */}
                        {!loadingClinic && (clinicVerified || (router.query.clinicId as string)) && (
                            <div className="mb-5 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                                <div className="text-center">
                                    {clinicIcon && (
                                        <img src={clinicIcon} alt={clinicName} className="w-12 h-12 mx-auto mb-2 rounded-full object-cover shadow-md" />
                                    )}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Registering for</p>
                                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{clinicName}</p>
                                    {clinicCode && <p className="text-xs text-gray-400 mt-0.5 font-mono">ID: {clinicCode}</p>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        localStorage.removeItem('clinicId')
                                        localStorage.removeItem('clinicName')
                                        window.location.href = '/'
                                    }}
                                    className="w-full mt-3 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors border border-red-200/50 dark:border-red-800/50"
                                >
                                    Switch Clinic
                                </button>
                            </div>
                        )}
                        
                        {/* Header */}
                        <div className="mb-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Staff Registration</h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Create your account — admin approval required</p>
                                </div>
                            </div>
                        </div>

                        {/* Clinic Code Input */}
                        {!(clinicVerified || (router.query.clinicId as string)) && (
                            <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Clinic Access Code <span className="text-red-500">*</span>
                                </label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={clinicCode} 
                                        onChange={e => {
                                            setClinicCode(e.target.value.toUpperCase())
                                            if (clinicInputError) setClinicInputError('')
                                        }} 
                                        placeholder="e.g., 900123" 
                                        className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                                        disabled={loadingClinic}
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleClinicCodeSubmit}
                                        disabled={loadingClinic || !clinicCode.trim()}
                                        className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/20 whitespace-nowrap"
                                    >
                                        {loadingClinic ? (
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        ) : 'Verify'}
                                    </button>
                                </div>
                                {clinicInputError && (
                                    <p className="text-red-500 dark:text-red-400 text-xs mt-2 flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                        {clinicInputError}
                                    </p>
                                )}
                            </div>
                        )}

                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    required 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    placeholder="John Doe" 
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    required 
                                    type="email"
                                    value={email} 
                                    onChange={e => setEmail(e.target.value)} 
                                    placeholder="john@example.com" 
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        required 
                                        type={showPassword ? 'text' : 'password'} 
                                        value={password} 
                                        onChange={e => setPassword(e.target.value)} 
                                        placeholder="••••••••" 
                                        className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all pr-10"
                                        minLength={6}
                                    />
                                    <ToggleEye show={showPassword} onToggle={() => setShowPassword(v => !v)} />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Role <span className="text-red-500">*</span>
                                </label>
                                <CustomSelect
                                    value={role}
                                    onChange={(val) => setRole(val)}
                                    options={roleOptions}
                                    placeholder="Select your role"
                                    allowCustom={false}
                                    onOpenChange={setIsRoleDropdownOpen}
                                    loading={loadingOptions}
                                />
                                <p className="text-xs text-gray-400 mt-1">Select the role that matches your responsibilities</p>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-xs sm:text-sm flex items-start gap-2">
                                <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-amber-800 dark:text-amber-300">Your account will be activated only after admin approval.</span>
                            </div>

                            <button 
                                disabled={loading || (!clinicVerified && !(router.query.clinicId as string))} 
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 text-sm sm:text-base"
                            >
                                {loading ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        Submitting…
                                    </>
                                ) : (
                                    <>
                                        Submit Registration
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleGoogleAuth}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Continue with Google</span>
                            </button>
                        </form>

                        <p className="text-xs sm:text-sm text-center text-gray-500 dark:text-gray-400 mt-4">
                            Already have an account?{' '}
                            <a href={clinicVerified || router.query.clinicId ? `/login?clinicId=${clinicCode || router.query.clinicId}` : "/clinic-login"} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                                Login
                            </a>
                        </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
