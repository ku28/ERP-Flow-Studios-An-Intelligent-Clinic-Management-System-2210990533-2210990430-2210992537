import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

type ReviewPayload = {
    clinicName: string
    clinicCode: string
    adminEmail: string
    adminName: string | null
    requestedPlan: 'standard' | 'pro'
    requestedCycle: 'annual' | 'fiveYear'
    paymentMethod: 'pay_online' | 'pay_to_owner'
    amount: number
    couponCode: string | null
    razorpayPaymentId: string | null
    status: 'pending' | 'approved' | 'rejected'
    createdAt: string
    decidedAt: string | null
    decidedBy: string | null
    notes: string | null
}

export default function ReviewUpgradeRequestPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [request, setRequest] = useState<ReviewPayload | null>(null)

    const token = typeof router.query.token === 'string' ? router.query.token : ''

    const loadRequest = async () => {
        if (!token) return
        setLoading(true)
        setError('')
        try {
            const resp = await fetch(`/api/clinic/review-upgrade-request?token=${encodeURIComponent(token)}`)
            const data = await resp.json()
            if (!resp.ok) throw new Error(data.error || 'Failed to load request')
            setRequest(data.request)
        } catch (err: any) {
            setError(err.message || 'Failed to load request')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadRequest()
    }, [token])

    const submitDecision = async (action: 'approve' | 'decline') => {
        if (!token || submitting || !request || request.status !== 'pending') return
        setSubmitting(true)
        setError('')
        setMessage('')
        try {
            const resp = await fetch('/api/clinic/review-upgrade-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action }),
            })
            const data = await resp.json()
            if (!resp.ok) throw new Error(data.error || 'Failed to submit decision')
            setMessage(action === 'approve' ? 'Upgrade request approved successfully.' : 'Upgrade request declined.')
            await loadRequest()
        } catch (err: any) {
            setError(err.message || 'Failed to submit decision')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <Head>
                <title>Review Upgrade Request | ERP Flow Studios</title>
            </Head>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-10">
                <div className="max-w-2xl mx-auto">
                    <div className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 shadow-xl p-6 sm:p-8">
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">Upgrade Request Review</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Approve or decline this payment verification request.</p>

                        {loading && <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Loading request details...</p>}

                        {error && (
                            <div className="mt-5 rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                                {message}
                            </div>
                        )}

                        {request && !loading && (
                            <div className="mt-6 space-y-5">
                                <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 p-4">
                                    <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">Clinic</p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{request.clinicName}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Code: {request.clinicCode}</p>
                                </div>

                                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                    <InfoRow label="Admin" value={request.adminName || request.adminEmail} />
                                    <InfoRow label="Email" value={request.adminEmail} />
                                    <InfoRow label="Requested Plan" value={request.requestedPlan.toUpperCase()} />
                                    <InfoRow label="Billing Cycle" value={request.requestedCycle === 'fiveYear' ? '5 Year' : 'Annual'} />
                                    <InfoRow label="Payment Method" value={request.paymentMethod === 'pay_online' ? 'Pay Online' : 'Pay to Owner'} />
                                    <InfoRow label="Amount" value={`Rs ${request.amount}`} />
                                    <InfoRow label="Coupon" value={request.couponCode || 'None'} />
                                    <InfoRow label="Razorpay Payment" value={request.razorpayPaymentId || 'Not provided'} />
                                </div>

                                <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
                                    <p className="text-sm text-amber-800 dark:text-amber-300 font-semibold">Current Status: {request.status.toUpperCase()}</p>
                                    {request.decidedAt && (
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                            Decided at {new Date(request.decidedAt).toLocaleString()} {request.decidedBy ? `by ${request.decidedBy}` : ''}
                                        </p>
                                    )}
                                </div>

                                {request.status === 'pending' && (
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() => submitDecision('approve')}
                                            className="flex-1 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm"
                                        >
                                            {submitting ? 'Submitting...' : 'Approve Request'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() => submitDecision('decline')}
                                            className="flex-1 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-sm"
                                        >
                                            {submitting ? 'Submitting...' : 'Decline Request'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 bg-white dark:bg-gray-800">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 break-all">{value}</p>
        </div>
    )
}
