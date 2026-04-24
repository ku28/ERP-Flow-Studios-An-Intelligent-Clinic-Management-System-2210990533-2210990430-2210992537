import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

// Haversine formula to compute distance between two GPS coordinates (in meters)
function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000 // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

export default function ClinicLogin() {
    const router = useRouter()
    const { clinicId: urlClinicId, reason } = router.query
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [clinicId, setClinicId] = useState('')
    const [showRequestForm, setShowRequestForm] = useState(false)
    const [adminEmail, setAdminEmail] = useState('')
    const [requestLoading, setRequestLoading] = useState(false)
    const [requestSuccess, setRequestSuccess] = useState(false)
    const [requestType, setRequestType] = useState<'login_request' | 'access_code' | null>(null)
    const [clinicWarning, setClinicWarning] = useState('')
    const [approvalToken, setApprovalToken] = useState<string | null>(null)
    const [pollingStatus, setPollingStatus] = useState<'waiting' | 'approved' | 'rejected' | 'logging-in'>('waiting')
    const [geoChecking, setGeoChecking] = useState(false)
    // Geo-blocked modal state
    const [geoBlocked, setGeoBlocked] = useState(false)
    const [blockedClinic, setBlockedClinic] = useState<any>(null)
    const [blockedDistanceText, setBlockedDistanceText] = useState('')
    const [geoRequestStep, setGeoRequestStep] = useState<'form' | 'waiting' | 'approved' | 'denied'>('form')
    const [geoRequestEmail, setGeoRequestEmail] = useState('')
    const [geoRequestName, setGeoRequestName] = useState('')
    const [geoRequestId, setGeoRequestId] = useState('')
    const [geoRequestLoading, setGeoRequestLoading] = useState(false)
    const [geoRequestError, setGeoRequestError] = useState('')
    const [geoRedeemUrl, setGeoRedeemUrl] = useState('')

    useEffect(() => {
        if (urlClinicId) {
            setClinicId(urlClinicId as string)
            // Auto-redirect if clinicId is in URL
            router.push(`/login?clinicId=${urlClinicId}`)
        }
    }, [urlClinicId])

    // ----- Multi-location Geo-restriction helper -----
    const checkGeoAccess = (clinic: any): Promise<boolean> => {
        return new Promise((resolve) => {
            const locations: Array<{lat: number; lng: number; radius: number; name?: string}> =
                clinic.locations || []

            // If clinic has no locations configured, skip geo check
            if (locations.length === 0) {
                resolve(true)
                return
            }

            if (!navigator.geolocation) {
                resolve(true)
                return
            }

            setGeoChecking(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGeoChecking(false)
                    const userLat = position.coords.latitude
                    const userLng = position.coords.longitude

                    // Allow if within range of ANY location
                    let minDistance = Infinity
                    for (const loc of locations) {
                        const dist = getDistanceMeters(userLat, userLng, loc.lat, loc.lng)
                        if (dist <= (loc.radius || 500)) {
                            resolve(true)
                            return
                        }
                        if (dist < minDistance) minDistance = dist
                    }

                    // Blocked — compute readable distance
                    const distText = minDistance > 1000
                        ? `${(minDistance / 1000).toFixed(1)} km`
                        : `${Math.round(minDistance)} meters`

                    setBlockedDistanceText(distText)
                    setBlockedClinic(clinic)
                    setGeoBlocked(true)
                    resolve(false)
                },
                () => {
                    setGeoChecking(false)
                    // Permission denied and clinic has geo restriction — show blocked modal
                    setBlockedDistanceText('unknown distance (location access denied)')
                    setBlockedClinic(clinic)
                    setGeoBlocked(true)
                    resolve(false)
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            )
        })
    }

    // Poll for geo access request approval
    useEffect(() => {
        if (geoRequestStep !== 'waiting' || !geoRequestId) return
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/clinic/geo-access-status?requestId=${geoRequestId}`)
                const data = await res.json()
                if (data.status === 'approved' && data.redeemUrl) {
                    clearInterval(interval)
                    setGeoRedeemUrl(data.redeemUrl)
                    setGeoRequestStep('approved')
                } else if (data.status === 'denied') {
                    clearInterval(interval)
                    setGeoRequestStep('denied')
                }
            } catch {}
        }, 3000)
        return () => clearInterval(interval)
    }, [geoRequestStep, geoRequestId])

    const handleGeoAccessRequest = async () => {
        if (!geoRequestEmail) {
            setGeoRequestError('Please enter your email address')
            return
        }
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRe.test(geoRequestEmail)) {
            setGeoRequestError('Please enter a valid email address')
            return
        }
        setGeoRequestLoading(true)
        setGeoRequestError('')
        try {
            const res = await fetch('/api/clinic/geo-access-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinicId: blockedClinic?.clinicId,
                    receptionistEmail: geoRequestEmail,
                    receptionistName: geoRequestName
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to send request')
            setGeoRequestId(data.requestId)
            setGeoRequestStep('waiting')
        } catch (err: any) {
            setGeoRequestError(err.message || 'Failed to send request')
        } finally {
            setGeoRequestLoading(false)
        }
    }

    const handleAccessCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setClinicWarning('')
        setLoading(true)

        if (clinicId.length !== 6 || !/^\d{6}$/.test(clinicId)) {
            setError('Access code must be a 6-digit number')
            setLoading(false)
            return
        }

        try {
            // Verify clinic exists
            const response = await fetch('/api/clinic/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Invalid access code')
            }

            // ---- GEO-RESTRICTION CHECK ----
            const geoAllowed = await checkGeoAccess(data.clinic)
            if (!geoAllowed) {
                setLoading(false)
                return
            }
            // --------------------------------

            // Store clinic ID in localStorage for persistent clinic session
            localStorage.setItem('clinicId', clinicId)
            localStorage.setItem('clinicName', data.clinic?.name || 'Clinic')

            if (data?.upgradeRequired) {
                setClinicWarning(data.warning || 'This clinic trial is expired. Login with admin email only.')
            }

            // Check if there are saved accounts for this clinic and auto-restore the last active one
            const storageKey = `savedAccounts_${clinicId}`
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
                            body: JSON.stringify({
                                sessionToken: lastActiveAccount.sessionToken,
                                clinicId
                            })
                        })
                        
                        if (restoreResponse.ok) {
                            // Session restored successfully, redirect to dashboard
                            router.replace(lastActiveAccount.role === 'receptionist' ? '/patients' : '/dashboard')
                            return
                        }
                    }
                } catch (err) {
                    // Continue to normal login if restore fails
                }
            }

            // Redirect to login page with clinicId
            router.push(`/login?clinicId=${clinicId}${data?.upgradeRequired ? '&expired=1' : ''}`)
        } catch (err: any) {
            setError(err.message || 'Invalid access code')
        } finally {
            setLoading(false)
        }
    }

    const handleRequestAccessCode = async () => {
        setError('')
        setRequestLoading(true)

        if (!adminEmail) {
            setError('Please enter your clinic admin email')
            setRequestLoading(false)
            return
        }

        try {
            const response = await fetch('/api/clinic/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinicAdminEmail: adminEmail,
                    requestType: 'access_code'
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send request')
            }

            setRequestType('access_code')
            setRequestSuccess(true)
            setAdminEmail('')
        } catch (err: any) {
            setError(err.message || 'Error sending access request')
        } finally {
            setRequestLoading(false)
        }
    }

    const handleRequestLogin = async () => {
        setError('')
        setRequestLoading(true)

        if (!adminEmail) {
            setError('Please enter your clinic admin email')
            setRequestLoading(false)
            return
        }

        try {
            const response = await fetch('/api/clinic/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinicAdminEmail: adminEmail,
                    requestType: 'login_request'
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send request')
            }

            // Store approval token and start polling
            setApprovalToken(data.approvalToken)
            setRequestType('login_request')
            setRequestSuccess(true)
            setPollingStatus('waiting')
            setAdminEmail('')
            
            // Start polling for approval
            startPolling(data.approvalToken)
        } catch (err: any) {
            setError(err.message || 'Error sending login request')
        } finally {
            setRequestLoading(false)
        }
    }

    const startPolling = (token: string) => {
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/clinic/check-request-status?token=${token}`)
                const data = await response.json()

                if (data.status === 'approved' && data.loginToken) {
                    clearInterval(pollInterval)
                    setPollingStatus('logging-in')
                    
                    // Auto-login with the token
                    await performAutoLogin(data.loginToken, data.clinicId)
                } else if (data.status === 'rejected') {
                    clearInterval(pollInterval)
                    setPollingStatus('rejected')
                } else if (data.status === 'expired') {
                    clearInterval(pollInterval)
                    setError(data.message || 'Request expired')
                    setRequestSuccess(false)
                }
            } catch (err) {
            }
        }, 3000) // Poll every 3 seconds

        // Clear polling after 30 minutes
        setTimeout(() => {
            clearInterval(pollInterval)
        }, 30 * 60 * 1000)
    }

    const performAutoLogin = async (loginToken: string, loginClinicId: string) => {
        try {
            // Create a session using the login token
            const response = await fetch('/api/auth/auto-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginToken, clinicId: loginClinicId })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Auto-login failed')
            }

            // Store clinic information
            localStorage.setItem('clinicId', loginClinicId)
            if (data.user?.name) {
                localStorage.setItem('userName', data.user.name)
            }
            
            // Show success animation briefly then redirect
            setTimeout(() => {
                router.replace(data.redirectUrl || '/dashboard')
            }, 1500)
        } catch (err: any) {
            setError('Auto-login failed. Please try logging in manually.')
            setPollingStatus('rejected')
        }
    }

    useEffect(() => {
        if (geoRequestStep !== 'approved' || !geoRedeemUrl) return

        const timer = setTimeout(() => {
            if (geoRedeemUrl.startsWith('/')) {
                router.replace(geoRedeemUrl)
            } else {
                window.location.href = geoRedeemUrl
            }
        }, 1500)

        return () => clearTimeout(timer)
    }, [geoRequestStep, geoRedeemUrl, router])

    const handleRequestAccess = (e: React.FormEvent) => {
        e.preventDefault()
    }

    return (
        <>
            <Head>
                <title>Clinic Login | ERP Flow Studios</title>
            </Head>
            {/* ===== Geo-Blocked Modal ===== */}
            {geoBlocked && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5 text-white">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Access Restricted</h2>
                                    <p className="text-white/80 text-xs">{blockedClinic?.name} ERP</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6">
                            {/* Why blocked */}
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-5">
                                <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">Why can&apos;t I access {blockedClinic?.name} ERP?</p>
                                <p className="text-xs text-red-700 dark:text-red-400">
                                    You are <strong>{blockedDistanceText}</strong> away from the clinic. Access to this system is restricted to staff physically present at the clinic premises.
                                </p>
                                {blockedClinic?.locations?.length > 0 && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                        Registered location{blockedClinic.locations.length > 1 ? 's' : ''}: {blockedClinic.locations.map((l: any) => l.name || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`).join(' • ')}
                                    </p>
                                )}
                            </div>

                            {/* Request form / waiting / approved / denied */}
                            {geoRequestStep === 'form' && (
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Request 30-Minute Temporary Access</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Send an approval request to the clinic admin. Once approved, you&apos;ll be automatically logged in for 30 minutes.
                                        </p>
                                    </div>

                                    {geoRequestError && (
                                        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{geoRequestError}</p>
                                    )}

                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Your Name (optional)</label>
                                        <input
                                            type="text"
                                            value={geoRequestName}
                                            onChange={e => setGeoRequestName(e.target.value)}
                                            placeholder="e.g. John Doe"
                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Your Email <span className="text-red-500">*</span></label>
                                        <input
                                            type="email"
                                            value={geoRequestEmail}
                                            onChange={e => { setGeoRequestEmail(e.target.value); setGeoRequestError('') }}
                                            placeholder="your@email.com"
                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Must match your account in this clinic.</p>
                                    </div>

                                    <button
                                        onClick={handleGeoAccessRequest}
                                        disabled={geoRequestLoading}
                                        className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold rounded-xl transition-all disabled:opacity-60 shadow-lg shadow-orange-500/30 text-sm"
                                    >
                                        {geoRequestLoading ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                                Sending…
                                            </span>
                                        ) : '📨 Request Access for 30 Minutes'}
                                    </button>

                                    <button
                                        onClick={() => setGeoBlocked(false)}
                                        className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    >
                                        Cancel — go back
                                    </button>
                                </div>
                            )}

                            {geoRequestStep === 'waiting' && (
                                <div className="text-center py-4 space-y-4">
                                    <div className="relative w-16 h-16 mx-auto">
                                        <div className="absolute inset-0 border-4 border-orange-200 rounded-full" />
                                        <div className="absolute inset-0 border-4 border-transparent border-t-orange-500 rounded-full animate-spin" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">Waiting for Approval</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            An approval request has been sent to the clinic admin. This page will update automatically when approved.
                                        </p>
                                    </div>
                                    <p className="text-xs text-gray-400">Checking every 3 seconds…</p>
                                </div>
                            )}

                            {geoRequestStep === 'approved' && (
                                <div className="text-center py-4 space-y-4">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                                        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-green-700 dark:text-green-400">Access Approved!</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">You have been granted 30-minute temporary access. Logging you in…</p>
                                    </div>
                                    <a
                                        href={geoRedeemUrl}
                                        className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm inline-block text-center"
                                    >
                                        Click here if not redirected automatically
                                    </a>
                                </div>
                            )}

                            {geoRequestStep === 'denied' && (
                                <div className="text-center py-4 space-y-4">
                                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">Request Denied</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">The clinic admin denied your access request. Please contact them directly.</p>
                                    <button
                                        onClick={() => { setGeoRequestStep('form'); setGeoRequestEmail(''); setGeoRequestError('') }}
                                        className="text-xs text-orange-600 hover:underline"
                                    >Try again with a different email</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}            <div className="flex items-center justify-center px-4">
                <div className="max-w-md w-full">
                    {requestSuccess ? (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-10 text-center border border-green-200 dark:border-green-800">
                            {requestType === 'login_request' ? (
                                // Login request - show polling waiting state
                                <>
                                    {pollingStatus === 'waiting' && (
                                        <>
                                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center animate-pulse">
                                                <svg className="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            </div>
                                            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Waiting for Approval</h2>
                                            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                                                Your login request has been sent to the super admin. You'll be automatically logged in when approved.
                                            </p>
                                            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6 mb-8">
                                                <div className="flex items-center justify-center gap-3 mb-3">
                                                    <div className="flex space-x-1">
                                                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                                    </div>
                                                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">Checking for approval...</p>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    <strong>No action needed!</strong> Keep this window open and you'll be logged in automatically once approved.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setRequestSuccess(false)
                                                    setShowRequestForm(false)
                                                    setApprovalToken(null)
                                                    setPollingStatus('waiting')
                                                }}
                                                className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold py-4 px-6 rounded-xl transition-all shadow-lg"
                                            >
                                                Cancel & Go Back
                                            </button>
                                        </>
                                    )}
                                    {pollingStatus === 'logging-in' && (
                                        <>
                                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                <svg className="w-12 h-12 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">✨ Approved!</h2>
                                            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                                                Logging you in now...
                                            </p>
                                            <div className="flex justify-center">
                                                <svg className="animate-spin h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            </div>
                                        </>
                                    )}
                                    {pollingStatus === 'rejected' && (
                                        <>
                                            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                                <svg className="w-12 h-12 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </div>
                                            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Request Rejected</h2>
                                            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                                                Your login request was not approved. Please contact your clinic administrator for assistance.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setRequestSuccess(false)
                                                    setShowRequestForm(false)
                                                    setApprovalToken(null)
                                                    setPollingStatus('waiting')
                                                }}
                                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg"
                                            >
                                                Try Again
                                            </button>
                                        </>
                                    )}
                                </>
                            ) : (
                                // Access code request - show email check message
                                <>
                                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                        <svg className="w-12 h-12 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Request Submitted!</h2>
                                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                                        Your request has been sent to the super admin. You'll receive an email notification once it's reviewed.
                                    </p>
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-8">
                                        <div className="flex items-center justify-center gap-3 mb-3">
                                            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">Waiting for Approval</p>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Typical response time: <strong>Within 24 hours</strong>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setRequestSuccess(false)
                                            setShowRequestForm(false)
                                        }}
                                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg"
                                    >
                                        Back to Login
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-10">
                                <div className="inline-block p-4 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-2xl mb-6 shadow-lg">
                                    <svg className="w-16 h-16 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-3">
                                    {showRequestForm ? 'Request Access' : 'Access Your Clinic'}
                                </h1>
                                <p className="text-lg text-gray-600 dark:text-gray-400">
                                    {showRequestForm ? 'Send a request to the super admin for clinic access' : 'Enter your 6-digit clinic access code to continue'}
                                </p>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-10 border border-gray-200 dark:border-gray-700">
                                {!showRequestForm ? (
                                    <form onSubmit={handleAccessCodeSubmit} className="space-y-6">
                                                        {error && (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                                                {error}
                                            </div>
                                        )}

                                        {clinicWarning && (
                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-lg text-sm font-medium">
                                                {clinicWarning}
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Clinic Access Code
                                            </label>
                                            <input
                                                type="text"
                                                value={clinicId}
                                                onChange={(e) => {
                                                    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                                                    setClinicId(value)
                                                    setError('')
                                                }}
                                                maxLength={6}
                                                required
                                                autoFocus
                                                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                                placeholder="000000"
                                                disabled={showRequestForm}
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                                                Enter the 6-digit access code for your clinic
                                            </p>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={loading || geoChecking}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {geoChecking ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Checking your location...
                                                </>
                                            ) : loading ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Verifying...
                                                </>
                                            ) : 'Access Clinic'}
                                        </button>

                                        <div className="relative">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                                            </div>
                                            <div className="relative flex justify-center text-sm">
                                                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setShowRequestForm(true)}
                                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Request Access from Super Admin
                                        </button>

                                        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                                            Don't have an access code?{' '}
                                            <button
                                                type="button"
                                                onClick={() => router.push('/register-clinic')}
                                                className="text-blue-600 hover:text-blue-700 font-medium"
                                            >
                                                Register your clinic
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <form onSubmit={handleRequestAccess} className="space-y-6">
                                        {error && (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                                                {error}
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Clinic Admin Email
                                            </label>
                                            <input
                                                type="email"
                                                value={adminEmail}
                                                onChange={(e) => {
                                                    setAdminEmail(e.target.value)
                                                    setError('')
                                                }}
                                                required
                                                autoFocus
                                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                                placeholder="admin@clinic.com"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                Enter the email address associated with your clinic admin account
                                            </p>
                                        </div>

                                        <div className="space-y-4">
                                            <button
                                                type="button"
                                                onClick={handleRequestLogin}
                                                disabled={requestLoading}
                                                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-xl flex items-center justify-center gap-3"
                                            >
                                                {requestLoading ? (
                                                    <>
                                                        <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Sending Request...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                                        </svg>
                                                        <span>Request for Login</span>
                                                    </>
                                                )}
                                            </button>

                                            <div className="relative">
                                                <div className="absolute inset-0 flex items-center">
                                                    <div className="w-full border-t-2 border-gray-300 dark:border-gray-600"></div>
                                                </div>
                                                <div className="relative flex justify-center text-sm">
                                                    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 font-medium">OR</span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleRequestAccessCode}
                                                disabled={requestLoading}
                                                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-xl flex items-center justify-center gap-3"
                                            >
                                                {requestLoading ? (
                                                    <>
                                                        <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Sending Request...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                        </svg>
                                                        <span>Request Access Code Only</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setShowRequestForm(false)}
                                            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                                        >
                                            Back
                                        </button>
                                    </form>
                                )}
                            </div>

                            <div className="text-center mt-8">
                                <button
                                    onClick={() => router.push('/')}
                                    className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back to Home
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    )
}
