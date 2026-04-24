import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

type Status = 'loading' | 'confirm' | 'processing' | 'approved' | 'denied' | 'already_actioned' | 'error'

export default function GeoAccessApprovePage() {
    const router = useRouter()
    const { token, action: defaultAction } = router.query

    const [status, setStatus] = useState<Status>('loading')
    const [error, setError] = useState('')
    const [clinicName, setClinicName] = useState('')
    const [userName, setUserName] = useState('')
    const [expiresAt, setExpiresAt] = useState('')
    const [alreadyStatus, setAlreadyStatus] = useState('')
    const [approverEmail, setApproverEmail] = useState('')
    const [requestDetails, setRequestDetails] = useState<any>(null)

    useEffect(() => {
        if (!token) return
        // Fetch request details to show in confirm screen
        fetchRequestDetails(token as string)
    }, [token])

    const fetchRequestDetails = async (tok: string) => {
        try {
            const res = await fetch(`/api/clinic/geo-access-request-details?token=${tok}`)
            if (res.ok) {
                const data = await res.json()
                setRequestDetails(data)
                setClinicName(data.clinicName || '')
            }
        } catch {}
        setStatus('confirm')
    }

    const handleAction = async (action: 'approve' | 'deny') => {
        setStatus('processing')
        try {
            const res = await fetch('/api/clinic/geo-access-approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action, approverEmail })
            })
            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Failed to process request')
                setStatus('error')
                return
            }

            if (data.alreadyActioned) {
                setAlreadyStatus(data.status)
                setStatus('already_actioned')
                return
            }

            if (action === 'approve') {
                setUserName(data.userName || '')
                setClinicName(data.clinicName || '')
                setExpiresAt(data.expiresAt || '')
                setStatus('approved')
            } else {
                setStatus('denied')
            }
        } catch (err) {
            setError('Network error. Please try again.')
            setStatus('error')
        }
    }

    const formatExpiry = (iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } catch {
            return '30 minutes from now'
        }
    }

    return (
        <>
            <Head>
                <title>Location Access Request — ERP Flow Studios</title>
            </Head>
            <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">Location Access Request</h1>
                        <p className="text-gray-500 text-sm mt-1">ERP Flow Studios</p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
                        {/* Loading */}
                        {status === 'loading' && (
                            <div className="text-center py-8">
                                <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                <p className="text-gray-500">Loading request details…</p>
                            </div>
                        )}

                        {/* Confirm */}
                        {status === 'confirm' && (
                            <div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                                    <div className="flex items-start gap-3">
                                        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <div>
                                            <p className="font-semibold text-amber-800 text-sm">30-Minute Temporary Access</p>
                                            <p className="text-amber-700 text-xs mt-1">
                                                This will allow the staff member to log in from outside the clinic&apos;s location for 30 minutes.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {requestDetails && (
                                    <div className="mb-6 space-y-2 text-sm">
                                        <div className="flex justify-between py-2 border-b border-gray-100">
                                            <span className="text-gray-500">Staff Email</span>
                                            <span className="font-medium text-gray-800">{requestDetails.receptionistEmail}</span>
                                        </div>
                                        {requestDetails.receptionistName && (
                                            <div className="flex justify-between py-2 border-b border-gray-100">
                                                <span className="text-gray-500">Name</span>
                                                <span className="font-medium text-gray-800">{requestDetails.receptionistName}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between py-2 border-b border-gray-100">
                                            <span className="text-gray-500">Clinic</span>
                                            <span className="font-medium text-gray-800">{requestDetails.clinicName}</span>
                                        </div>
                                        <div className="flex justify-between py-2">
                                            <span className="text-gray-500">Requested</span>
                                            <span className="font-medium text-gray-800">
                                                {requestDetails.requestedAt
                                                    ? new Date(requestDetails.requestedAt).toLocaleString()
                                                    : 'Recently'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Your email (for audit log, optional)
                                    </label>
                                    <input
                                        type="email"
                                        value={approverEmail}
                                        onChange={e => setApproverEmail(e.target.value)}
                                        placeholder="admin@clinic.com"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleAction('deny')}
                                        className="flex-1 px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors text-sm"
                                    >
                                        ❌ Deny Request
                                    </button>
                                    <button
                                        onClick={() => handleAction('approve')}
                                        className="flex-1 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors text-sm shadow-lg shadow-green-500/30"
                                    >
                                        ✅ Approve Access
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Processing */}
                        {status === 'processing' && (
                            <div className="text-center py-8">
                                <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                <p className="text-gray-600 font-medium">Processing your decision…</p>
                            </div>
                        )}

                        {/* Approved */}
                        {status === 'approved' && (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Access Approved!</h2>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>{userName || 'The staff member'}</strong> has been granted 30-minute access to{' '}
                                    <strong>{clinicName}</strong> ERP.
                                </p>
                                {expiresAt && (
                                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                                        ⏱️ Session expires at <strong>{formatExpiry(expiresAt)}</strong>
                                    </div>
                                )}
                                <p className="text-xs text-gray-400 mt-4">
                                    They will be automatically logged in on their device.
                                </p>
                            </div>
                        )}

                        {/* Denied */}
                        {status === 'denied' && (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Request Denied</h2>
                                <p className="text-gray-600 text-sm">
                                    The access request has been denied. The staff member will be notified on their screen.
                                </p>
                            </div>
                        )}

                        {/* Already actioned */}
                        {status === 'already_actioned' && (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Already Processed</h2>
                                <p className="text-gray-600 text-sm">
                                    This request was already <strong>{alreadyStatus}</strong> by another admin. No further action is needed.
                                </p>
                            </div>
                        )}

                        {/* Error */}
                        {status === 'error' && (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
                                <p className="text-red-600 text-sm">{error}</p>
                                <button
                                    onClick={() => setStatus('confirm')}
                                    className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
                                >
                                    Try again
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
