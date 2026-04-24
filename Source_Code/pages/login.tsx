import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const ToastNotification = dynamic(() => import('../components/ToastNotification'), { ssr: false });
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { setCachedCurrentUser } from '../lib/currentUserStorage';

export default function LoginPage() {
    const [emailOrPhone, setEmailOrPhone] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saveLoginInfo, setSaveLoginInfo] = useState(true)
    const router = useRouter()
    const { toasts, removeToast, showError, showSuccess } = useToast()
    const { user: authUser } = useAuth()
    const [isAddMode, setIsAddMode] = useState(false)
    const [clinicName, setClinicName] = useState('ERP Flow Studios')
    const [clinicCode, setClinicCode] = useState('')
    const [clinicIcon, setClinicIcon] = useState('')
    const [loadingClinic, setLoadingClinic] = useState(true)
    const [expiredClinicWarning, setExpiredClinicWarning] = useState('')
    // Forgot password modal state
    const [showForgot, setShowForgot] = useState(false)
    const [forgotEmail, setForgotEmail] = useState('')
    const [forgotLoading, setForgotLoading] = useState(false)
    const [forgotError, setForgotError] = useState('')
    const [forgotSuccess, setForgotSuccess] = useState('')

    type LoginPayload = {
        sessionToken?: string
        user?: {
            id: number
            name?: string | null
            email: string
            role: string
            profileImage?: string | null
            clinicId?: string | null
        }
    }

    useEffect(() => {
        if (!router.isReady) return

        if (router.query.expired === '1') {
            setExpiredClinicWarning('This clinic trial is expired. Please login with admin email only to continue upgrade process.')
        } else {
            setExpiredClinicWarning('')
        }

        const clinicIdFromQuery = typeof router.query.clinicId === 'string' ? router.query.clinicId : ''
        const modeFromQuery = typeof router.query.mode === 'string' ? router.query.mode : ''
        const nextFromQuery = typeof router.query.next === 'string' ? router.query.next : ''
        const storedClinicId = localStorage.getItem('clinicId') || ''

        // Keep add-account mode in sync with query.
        setIsAddMode(modeFromQuery === 'add')

        // Canonicalize /login route with clinicId from storage to prevent redirect loops.
        if (router.pathname === '/login' && !clinicIdFromQuery) {
            if (storedClinicId) {
                const params = new URLSearchParams()
                params.set('clinicId', storedClinicId)
                if (modeFromQuery === 'add') params.set('mode', 'add')
                if (nextFromQuery) params.set('next', nextFromQuery)
                router.replace(`/login?${params.toString()}`)
            } else {
                router.replace('/clinic-login')
            }
            return
        }

        let cancelled = false

        // Fetch clinic info from query params.
        const fetchClinicInfo = async () => {
            const clinicIdForLogin = clinicIdFromQuery || storedClinicId
            if (clinicIdForLogin) {
                try {
                    const res = await fetch('/api/clinic/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clinicId: clinicIdForLogin })
                    })

                    if (res.ok) {
                        const data = await res.json()
                        if (cancelled) return
                        setClinicName(data.clinic.name)
                        setClinicCode(data.clinic.clinicId)
                        setClinicIcon(data.clinic.iconUrl || '')
                    }
                } catch (error) {
                } finally {
                    if (!cancelled) setLoadingClinic(false)
                }
            } else {
                // Try to get from AuthContext user session.
                if (authUser?.clinic?.name) {
                    if (!cancelled) {
                        setClinicName(authUser.clinic.name)
                        setClinicCode(authUser.clinic.clinicId || '')
                        setClinicIcon(authUser.clinic.iconUrl || '')
                    }
                }
                if (!cancelled) setLoadingClinic(false)
            }
        }

        fetchClinicInfo()

        return () => {
            cancelled = true
        }
    }, [router.isReady, router.pathname, router.query.clinicId, router.query.mode, router.query.next, router.query.expired])

    useEffect(() => {
        // Add auth-page class to body to exclude from uppercase CSS
        document.body.classList.add('auth-page')
        return () => {
            document.body.classList.remove('auth-page')
        }
    }, [])

    async function submit(e: any) {
        e.preventDefault()
        
        const clinicIdFromUrl = (router.query.clinicId as string) || localStorage.getItem('clinicId') || ''
        
        setLoading(true)
        const res = await fetch('/api/auth/login', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                emailOrPhone, 
                password,
                clinicId: clinicIdFromUrl || undefined // Pass clinicId to ensure user belongs to this clinic
            }) 
        })
        let loginPayload: LoginPayload | null = null
        try {
            loginPayload = await res.json()
        } catch {
            loginPayload = null
        }
        setLoading(false)
        if (res.ok) {
            // Seed session cache immediately to avoid post-login race conditions.
            setCachedCurrentUser(loginPayload?.user)

            // Store clinic ID in localStorage for persistent clinic session
            if (clinicIdFromUrl) {
                localStorage.setItem('clinicId', clinicIdFromUrl)
                if (clinicName && clinicName !== 'ERP Flow Studios') {
                    localStorage.setItem('clinicName', clinicName)
                }
            }
            
            // Dispatch custom event to notify components of login
            window.dispatchEvent(new Event('user-login'))
            
            // Get user data to determine redirect path
            const userRole = loginPayload?.user?.role;
            
            // Save account info if checkbox is checked - Fire and forget to prevent blocking
            if (saveLoginInfo) {
                saveAccountToLocalStorage(loginPayload || undefined).catch(console.error);
            }
            
            if (isAddMode) {
                showSuccess('Account added successfully!')
            }

            if ((loginPayload as any)?.upgradeRequired) {
                const trialEndsAt = (loginPayload as any)?.trialEndsAt ? `&trialEndsAt=${encodeURIComponent((loginPayload as any).trialEndsAt)}` : ''
                const trialDaysLeft = typeof (loginPayload as any)?.trialDaysLeft === 'number' ? `&trialDaysLeft=${(loginPayload as any).trialDaysLeft}` : ''
                const cid = clinicIdFromUrl ? `&clinicId=${encodeURIComponent(clinicIdFromUrl)}` : ''
                router.replace(`/upgrade?reason=trial_expired${cid}${trialEndsAt}${trialDaysLeft}`)
                return
            }
            
            // Navigate after save is complete - receptionist goes to patients page
            const redirectPath = userRole?.toLowerCase() === 'receptionist' ? '/patients' : '/dashboard'
            
            router.replace(redirectPath)
        }
        else {
            if ((loginPayload as any)?.upgradeRequired) {
                const reason = encodeURIComponent('trial_expired')
                const trialEndsAt = (loginPayload as any)?.trialEndsAt ? `&trialEndsAt=${encodeURIComponent((loginPayload as any).trialEndsAt)}` : ''
                const trialDaysLeft = typeof (loginPayload as any)?.trialDaysLeft === 'number' ? `&trialDaysLeft=${(loginPayload as any).trialDaysLeft}` : ''
                const cid = clinicIdFromUrl ? `&clinicId=${encodeURIComponent(clinicIdFromUrl)}` : ''
                router.replace(`/upgrade?reason=${reason}${cid}${trialEndsAt}${trialDaysLeft}`)
                return
            }
            if ((loginPayload as any)?.adminOnly) {
                showError((loginPayload as any)?.error || 'Only admin email can be used for login when clinic trial is expired.')
                return
            }
            showError((loginPayload as any)?.error || 'Invalid email/phone or password. Please try again.')
        }
    }

    async function saveAccountToLocalStorage(loginPayload?: LoginPayload) {
        try {
            let sessionToken = loginPayload?.sessionToken
            let user = loginPayload?.user

            if (!sessionToken || !user) {
                // Fallback: read from cookie-backed endpoint, with short retries for cookie propagation.
                for (let attempt = 0; attempt < 5; attempt++) {
                    if (attempt > 0) {
                        await new Promise(resolve => setTimeout(resolve, 150))
                    }

                    const tokenRes = await fetch('/api/auth/get-session-token', {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store'
                    })

                    if (!tokenRes.ok) {
                        continue
                    }

                    const tokenData = await tokenRes.json()
                    sessionToken = tokenData.sessionToken
                    user = tokenData.user
                    if (sessionToken && user) {
                        break
                    }
                }
            }

            if (!sessionToken || !user) {
                console.warn('Could not save login info: missing session token or user payload')
                return loginPayload?.user?.role
            }

            setCachedCurrentUser(user)

            // Load existing saved accounts for this clinic
            const clinicId = router.query.clinicId as string || localStorage.getItem('clinicId')
            const storageKey = clinicId ? `savedAccounts_${clinicId}` : 'savedAccounts'
            const stored = localStorage.getItem(storageKey)
            
            const accounts = stored ? JSON.parse(stored) : []
            
            // Check if account already exists
            const existingIndex = accounts.findIndex((acc: any) => acc.id === user.id)
            
            const accountData = {
                id: user.id,
                name: user.name || user.email,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage,
                sessionToken,
                lastActive: Date.now(),
                clinicId: user.clinicId
            }

            if (existingIndex >= 0) {
                // Update existing account
                accounts[existingIndex] = accountData
            } else {
                // Add new account
                accounts.push(accountData)
            }

            // Keep only last 10 accounts per clinic
            const limitedAccounts = accounts.slice(-10)
            
            // Save to localStorage with clinic-specific key
            const jsonString = JSON.stringify(limitedAccounts)
            localStorage.setItem(storageKey, jsonString)
            
            // Test if the saved token can be verified
            const testResponse = await fetch('/api/auth/switch-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionToken,
                    clinicId: clinicId || undefined,
                })
            })
            if (!testResponse.ok) {
                const errorData = await testResponse.json()
                console.warn('Saved token validation failed:', errorData)
            }
            
            return user.role // Return the user role for redirect
        } catch (error) {
            console.warn('Error saving login info:', error)
            return loginPayload?.user?.role
        }
    }

    async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setForgotLoading(true);
        setForgotError('');
        setForgotSuccess('');
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail })
        });
        const data = await res.json();
        setForgotLoading(false);
        if (res.ok) {
            setForgotSuccess('Reset link sent to your email and admin email.');
        } else {
            setForgotError(data.error || 'Error sending reset link');
        }
    }

    const handleGoogleAuth = () => {
        const clinicId = (router.query.clinicId as string) || localStorage.getItem('clinicId') || ''
        const params = new URLSearchParams({ from: 'login' })
        if (clinicId) params.set('clinicId', clinicId)
        window.location.href = `/api/auth/google-start?${params.toString()}`
    }

    useEffect(() => {
        if (!router.isReady) return
        const googleStatus = typeof router.query.google === 'string' ? router.query.google : ''
        if (!googleStatus) return

        const messages: Record<string, string> = {
            failed: 'Google sign-in was cancelled or failed. Please try again.',
            deleted_client: 'Google sign-in client is invalid or deleted. Please contact admin to update Google OAuth credentials.',
            token_failed: 'Google authentication failed while exchanging token.',
            email_unverified: 'Your Google email is not verified. Please use a verified Google account.',
            no_account: 'No account found with this Google email. Please register first.',
            clinic_mismatch: 'This Google account is not part of the selected clinic.',
            invalid_clinic: 'Invalid clinic selected for Google sign-in.',
            server_error: 'Google sign-in failed due to a server issue. Please try again.',
            not_configured: 'Google sign-in is not configured yet. Please contact admin.',
        }

        showError(messages[googleStatus] || 'Google sign-in failed. Please try again.')
        const clinicId = typeof router.query.clinicId === 'string' ? router.query.clinicId : ''
        const nextQuery = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ''
        router.replace(`/login${nextQuery}`, undefined, { shallow: true })
    }, [router.isReady, router.query.google, router.query.clinicId])

    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />
            <div className="min-h-[70vh] flex items-center justify-center px-3 sm:px-4 py-6 sm:py-8">
                <div className="max-w-md w-full">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                        
                        {/* Clinic Info Header */}
                        {clinicCode && !loadingClinic && (
                            <div className="mb-4 sm:mb-6 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <div className="text-center mb-3">
                                    {clinicIcon && (
                                        <img 
                                            src={clinicIcon} 
                                            alt={clinicName}
                                            className="w-12 h-12 mx-auto mb-2 rounded-full object-cover"
                                        />
                                    )}
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                        {clinicName}
                                    </h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        Access Code: <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{clinicCode}</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        localStorage.removeItem('clinicId')
                                        localStorage.removeItem('clinicName')
                                        router.replace('/')
                                    }}
                                    className="w-full px-3 py-2 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 rounded transition-colors"
                                >
                                    Logout Clinic
                                </button>
                            </div>
                        )}
                        
                        <div className="text-center mb-4 sm:mb-6">
                            <h2 className="text-xl sm:text-2xl font-bold mb-2">
                                {isAddMode ? 'Add Another Account' : 'Welcome Back'}
                            </h2>
                            <p className="text-muted text-xs sm:text-sm">
                                {isAddMode ? 'Sign in with a different account' : `Sign in to access ${clinicName}`}
                            </p>
                        </div>

                        <form onSubmit={submit} className="space-y-3 sm:space-y-4">
                        {expiredClinicWarning && (
                            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 font-medium">
                                {expiredClinicWarning}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs sm:text-sm font-medium mb-1.5">Email or Phone Number</label>
                            <input 
                                required 
                                value={emailOrPhone} 
                                onChange={e => setEmailOrPhone(e.target.value)} 
                                placeholder="demo@email.com or 9876543210" 
                                className="w-full p-2 sm:p-2.5 text-sm sm:text-base border rounded" 
                            />
                            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Enter your email address or 10-digit phone number
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs sm:text-sm font-medium mb-1.5">Password</label>
                            <div className="relative">
                                <input 
                                    required 
                                    type={showPassword ? 'text' : 'password'} 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    placeholder="••••••••" 
                                    className="w-full p-2 sm:p-2.5 text-sm sm:text-base border rounded pr-10" 
                                />
                                <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                    {showPassword ? (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)}
                                </button>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <label className="relative group/checkbox cursor-pointer flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={saveLoginInfo}
                                        onChange={(e) => setSaveLoginInfo(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110 flex-shrink-0">
                                        <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div className="absolute left-0 top-0 w-5 h-5 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                    <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 select-none">
                                        Save login info
                                    </span>
                                </label>
                                <button type="button" className="text-blue-600 hover:underline text-xs sm:text-sm" onClick={() => setShowForgot(true)}>
                                    Forgot Password?
                                </button>
                            </div>
                        </div>
                        <button 
                            disabled={loading} 
                            className="w-full btn bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 text-sm sm:text-base py-2 sm:py-2.5"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">OR</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleAuth}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Sign in with Google</span>
                        </button>

                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Don't have an account?{' '}
                                <Link href={clinicCode ? `/signup?clinicId=${clinicCode}` : "/signup"} className="text-blue-600 hover:underline font-medium">
                                    Register
                                </Link>
                            </p>
                        </div>
                    </form>


                </div>
            </div>
                </div>
            </div>

            {/* Forgot Password Modal */}
            {showForgot && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[9999] px-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-sm relative">
                        <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none" onClick={() => setShowForgot(false)}>&times;</button>
                        <h3 className="text-base sm:text-lg font-bold mb-2">Forgot Password</h3>
                        <form onSubmit={handleForgot}>
                            <label className="block text-xs sm:text-sm font-medium mb-1.5">Enter your registered email</label>
                            <input type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className="w-full p-2 text-sm sm:text-base border rounded mb-3" placeholder="your@email.com" />
                            {forgotError && <div className="text-red-600 mb-2 text-xs sm:text-sm">{forgotError}</div>}
                            {forgotSuccess && <div className="text-sky-600 mb-2 text-xs sm:text-sm">{forgotSuccess}</div>}
                            <button type="submit" className="w-full btn btn-primary text-sm sm:text-base" disabled={forgotLoading}>{forgotLoading ? 'Sending...' : 'Send Reset Link'}</button>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}


