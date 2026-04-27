import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import SEO from '../components/SEO'
import { useAuth } from '../contexts/AuthContext'
import { isBillingCycleLocked, MINIMUM_SUBSCRIPTION_TOOLTIP, normalizeBillingCycleWithMinimum } from '../lib/subscriptionBilling'

// ─── Pricing data (mirrors register-clinic.tsx) ──────────────────────────────
const BILLING_CYCLES = [
    { key: 'monthly', label: 'Monthly', shortLabel: '/mo' },
    { key: 'quarterly', label: '3 Months', shortLabel: '/3 mo' },
    { key: 'annual', label: '1 Year', shortLabel: '/yr' },
    { key: 'fiveYear', label: '5-Year Plan', shortLabel: 'one-time' },
]

const PLANS = [
    {
        id: 'basic',
        name: 'Basic',
        description: 'Starter plan for a compact clinic team.',
        prices: { monthly: 499, quarterly: 1199, annual: 3999, fiveYear: 19999 },
        features: [
            'Patient Management',
            'Smart Prescriptions',
            'Pharmacy & Inventory',
            'Invoice & Billing',
            '14 Days Free Trial',
            'Max 3 users: 1 Admin, 1 Doctor, 1 Staff',
            'Login session expires in 6 hours',
            'No Export / Admin Settings / Upload Bill / Aadhaar Scan',
        ],
    },
    {
        id: 'standard',
        name: 'Standard',
        description: 'All core features for growing clinics.',
        prices: { monthly: 999, quarterly: 2699, annual: 7999, fiveYear: 29999 },
        features: [
            'Everything in Basic +',
            '14 Days Free Trial',
            'Analytics & Reports',
            'Export Access',
            'Admin Settings Access',
            'Upload Bill',
            'Aadhaar Scanning',
            'Geo-restricted Login',
            'Treatment Templates',
            'Patient Import / Export',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        description: 'Advanced tools for growing clinics with AI-powered workflows.',
        prices: { monthly: 2499, quarterly: 6999, annual: 19999, fiveYear: 74999 },
        features: [
            'Everything in Basic +',
            '7 Days Free Trial',
            'Up to 15 Users',
            'AI-Powered Insights & Smart Suggestions',
            'Custom Branding & AI Custom Themes',
            'WhatsApp / SMS Appointment Automation',
            'Multi-Branch Management',
            'Custom Invoice Templates & Advanced Billing Controls',
            'Enhanced AI Model Access (Smarter Predictions)',
            'Priority AI Processing & Faster Performance',
            'Dedicated Priority Support',
        ],
    },
]

const ANNUAL_MAINTENANCE = 4999
const RAZORPAY_COMMISSION_RATE = 0.02
const RAZORPAY_COMMISSION_GST = 0.18

// ─── Component ───────────────────────────────────────────────────────────────
function UpgradePage() {
    const router = useRouter()
    const { user: authUser, loading: authContextLoading } = useAuth()
    const [user, setUser] = useState<any>(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [isAppRuntime, setIsAppRuntime] = useState(false)
    const [billingCycle, setBillingCycle] = useState('annual')
    const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<'standard' | 'pro'>('standard')
    const [showMinimumPlanNotice, setShowMinimumPlanNotice] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState<'online' | 'owner' | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<'plan' | 'payment'>('plan')
    const [upgradeRequestToken, setUpgradeRequestToken] = useState('')
    const [upgradeRequestStatus, setUpgradeRequestStatus] = useState<'idle' | 'pending' | 'activating' | 'rejected'>('idle')
    const [upgradePollInterval, setUpgradePollInterval] = useState<ReturnType<typeof setInterval> | null>(null)

    // AI OCR single-feature purchase state
    const [ocrStep, setOcrStep] = useState<'idle' | 'payment' | 'submitted'>('idle')
    const [ocrPaymentMethod, setOcrPaymentMethod] = useState<'online' | 'owner' | null>(null)
    const [ocrLoading, setOcrLoading] = useState(false)
    const [ocrError, setOcrError] = useState('')
    const [upgradeCouponCode, setUpgradeCouponCode] = useState('')
    const [upgradeDiscount, setUpgradeDiscount] = useState(0)
    const [upgradeCouponStatus, setUpgradeCouponStatus] = useState('')
    const [ocrCouponCode, setOcrCouponCode] = useState('')
    const [ocrDiscount, setOcrDiscount] = useState(0)
    const [ocrCouponStatus, setOcrCouponStatus] = useState('')
    const clinicIdFromQuery = typeof router.query?.clinicId === 'string' ? router.query.clinicId : ''

    const currentPlan = user?.clinic?.subscriptionPlan || 'basic'
    const trialDaysLeftFromQuery = Number(router.query?.trialDaysLeft || user?.clinic?.trialDaysLeft || 0)
    const trialEndsAtFromQuery = (router.query?.trialEndsAt as string) || user?.clinic?.trialEndsAt
    const isBasic = currentPlan === 'basic'
    const isStandard = currentPlan === 'standard'
    const isBasicAiOcr = currentPlan === 'basic_ai_ocr'
    const isStandardAiOcr = currentPlan === 'standard_ai_ocr'
    const canPurchaseAiOcrAddon = isBasic || isStandard
    const ocrAddonAmount = isBasic ? 999 : 499
    const ocrAddonTargetLabel = isBasic ? 'Basic + AI OCR' : 'Standard + AI OCR'
    const isUpgradeRequired = Boolean(user?.clinic?.upgradeRequired)
    const canAccessPage = user?.role === 'admin'

    useEffect(() => {
        if (user) {
            const plan = user.clinic?.subscriptionPlan || 'basic'
            if (plan === 'standard' || plan === 'standard_ai_ocr' || plan === 'pro') {
                setSelectedUpgradePlan('pro')
            }
        }
    }, [user])

    useEffect(() => {
        return () => {
            if (upgradePollInterval) clearInterval(upgradePollInterval)
        }
    }, [upgradePollInterval])

    useEffect(() => {
        const detectAppRuntime = () => {
            if (typeof window === 'undefined') return false
            const hasElectron = Boolean((window as any).electronAPI)
            const cap = (window as any).Capacitor
            const isNativeCapacitor = Boolean(cap && (
                (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
                (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web')
            ))
            return hasElectron || isNativeCapacitor
        }
        setIsAppRuntime(detectAppRuntime())
    }, [])

    useEffect(() => {
        if (authContextLoading) return
        setUser(authUser || null)
        setAuthLoading(false)
    }, [authUser, authContextLoading])

    useEffect(() => {
        const tokenFromQuery = typeof router.query.requestToken === 'string' ? router.query.requestToken : ''
        if (!tokenFromQuery) return
        if (upgradeRequestStatus !== 'idle') return
        if (upgradeRequestToken === tokenFromQuery) return
        startUpgradePolling(tokenFromQuery)
    }, [router.query.requestToken, upgradeRequestStatus, upgradeRequestToken])

    // Redirect non-admin or users who don't need this page
    useEffect(() => {
        if (user && (user.role !== 'admin' || !canAccessPage)) {
            router.replace('/dashboard')
        }
    }, [user, canAccessPage, router])

    const normalizedCycle = normalizeBillingCycleWithMinimum(billingCycle)
    const isFiveYear = normalizedCycle === 'fiveYear'
    const selectedUpgradePlanData = PLANS.find(p => p.id === selectedUpgradePlan)!
    const basicPlan = PLANS.find(p => p.id === 'basic')!
    const proPlan = PLANS.find(p => p.id === 'pro')!

    const getPlanPrice = () => selectedUpgradePlanData.prices[normalizedCycle as keyof typeof selectedUpgradePlanData.prices]
    const getBasePrice = () => {
        const price = getPlanPrice()
        if (isFiveYear) return Math.round(price / 1.18)
        return price
    }
    const getGstAmount = () => {
        const price = getPlanPrice()
        if (isFiveYear) return price - getBasePrice()
        return Math.round(price * 0.18)
    }
    const getPlanTotal = () => {
        if (isFiveYear) return getPlanPrice()
        return getPlanPrice() + getGstAmount()
    }
    const getRazorpayCommission = (planTotal?: number) => {
        const effectivePlanTotal = typeof planTotal === 'number' ? planTotal : getPlanTotal()
        const commission = Math.round(effectivePlanTotal * RAZORPAY_COMMISSION_RATE)
        const commissionGst = Math.round(commission * RAZORPAY_COMMISSION_GST)
        return { commission, commissionGst, total: commission + commissionGst }
    }
    const getGrandTotal = (planTotal?: number) => {
        const effectivePlanTotal = typeof planTotal === 'number' ? planTotal : getPlanTotal()
        return effectivePlanTotal + getRazorpayCommission(effectivePlanTotal).total
    }
    const getDiscountedUpgradePlanTotal = () => Math.max(0, getPlanTotal() - upgradeDiscount)
    const getDiscountedOcrTotal = () => Math.max(0, ocrAddonAmount - ocrDiscount)

    const applyCoupon = async (context: 'upgrade_plan' | 'ai_ocr_basic' | 'ai_ocr_standard', code: string, amount: number) => {
        const resp = await fetch('/api/coupons/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, code, amount }),
        })
        const data = await resp.json()
        if (!resp.ok) {
            throw new Error(data.error || 'Invalid coupon')
        }
        return {
            discountAmount: Number(data.discountAmount || 0),
            finalAmount: Number(data.finalAmount || amount),
            message: data.message || 'Coupon applied',
        }
    }

    const handleCycleSelection = (cycle: string) => {
        if (isBillingCycleLocked(cycle)) {
            setShowMinimumPlanNotice(true)
            return
        }
        setBillingCycle(cycle)
    }

    const redirectPaymentToBrowser = async () => {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
        const targetUrl = `${appUrl}/upgrade?reason=app_payment_redirect`
        const cap = typeof window !== 'undefined' ? (window as any).Capacitor : null
        const browserPlugin = cap?.Plugins?.Browser

        try {
            if (browserPlugin?.open) {
                await browserPlugin.open({ url: targetUrl })
                return
            }
        } catch {}

        if (typeof window !== 'undefined') {
            window.open(targetUrl, '_blank', 'noopener,noreferrer')
        }
    }

    useEffect(() => {
        if (!isAppRuntime) return
        if (step !== 'payment' && ocrStep !== 'payment') return
        setError('Payments are handled in browser for mobile/desktop apps. Redirecting...')
        redirectPaymentToBrowser()
        setStep('plan')
        setOcrStep('idle')
    }, [isAppRuntime, step, ocrStep])

    // ── Payment handlers ──
    const handlePayDirectly = () => {
        if (isAppRuntime) {
            setError('Payments are handled in browser for mobile/desktop apps. Redirecting...')
            redirectPaymentToBrowser()
            return
        }
        setPaymentMethod('owner')
        setError('')
    }

    const handlePayOnline = async () => {
        if (isAppRuntime) {
            setError('Payments are handled in browser for mobile/desktop apps. Redirecting...')
            await redirectPaymentToBrowser()
            return
        }
        setError('')
        const amount = getDiscountedUpgradePlanTotal()
        const platformCharges = getRazorpayCommission(amount)
        const totalAmount = amount + platformCharges.total
        const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
        if (!razorpayKey) {
            setError('Online payment is not configured yet. Please use "Pay Directly to Owner" option or contact support.')
            return
        }
        setPaymentMethod('online')

        if (!(window as any).Razorpay) {
            const script = document.createElement('script')
            script.src = 'https://checkout.razorpay.com/v1/checkout.js'
            script.async = true
            document.body.appendChild(script)
            await new Promise((resolve, reject) => {
                script.onload = resolve
                script.onerror = () => reject(new Error('Failed to load payment gateway'))
            }).catch(() => {
                setError('Failed to load payment gateway. Please check your internet connection.')
                setPaymentMethod(null)
                return
            })
            if (!(window as any).Razorpay) {
                setPaymentMethod(null)
                return
            }
        }

        const options = {
            key: razorpayKey,
            amount: totalAmount * 100,
            currency: 'INR',
            name: 'ERP Flow Studios',
            description: `${selectedUpgradePlanData.name} Plan Upgrade (${normalizedCycle})`,
            handler: function (response: any) {
                handleUpgradeSubmit('pay_online', response?.razorpay_payment_id)
            },
            prefill: {
                name: user?.name || '',
                email: user?.email || '',
                contact: user?.phone || '',
            },
            theme: { color: '#f59e0b' },
            modal: {
                ondismiss: function () {
                    setPaymentMethod(null)
                },
                escape: true,
                confirm_close: true,
            },
        }

        try {
            const rzp = new (window as any).Razorpay(options)
            rzp.on('payment.failed', function (response: any) {
                setError(`Payment failed: ${response.error?.description || 'Unknown error'}. Please try again.`)
                setPaymentMethod(null)
            })
            rzp.open()
        } catch {
            setError('Failed to open payment gateway. Please try again.')
            setPaymentMethod(null)
        }
    }

    const handleUpgradeSubmit = async (methodOverride?: 'pay_online' | 'pay_to_owner', razorpayPaymentId?: string) => {
        setLoading(true)
        setError('')
        try {
            const resp = await fetch('/api/clinic/upgrade-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedPlan: selectedUpgradePlan,
                    billingCycle: normalizedCycle,
                    paymentMethod: methodOverride || (paymentMethod === 'online' ? 'pay_online' : 'pay_to_owner'),
                    razorpayPaymentId: razorpayPaymentId || null,
                    couponCode: upgradeCouponCode || null,
                }),
            })

            const data = await resp.json()
            if (!resp.ok) {
                throw new Error(data.error || 'Failed to submit upgrade request')
            }

            setStep('plan')
            setPaymentMethod(null)
            setError('')
            if (typeof data.requestToken === 'string' && data.requestToken.trim()) {
                startUpgradePolling(data.requestToken)
            } else {
                setUpgradeRequestStatus('pending')
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit upgrade request')
        } finally {
            setLoading(false)
        }
    }

    const startUpgradePolling = (requestToken: string) => {
        if (!requestToken) return
        if (upgradePollInterval) {
            clearInterval(upgradePollInterval)
            setUpgradePollInterval(null)
        }

        setUpgradeRequestToken(requestToken)
        setUpgradeRequestStatus('pending')
        router.replace(
            {
                pathname: '/upgrade',
                query: {
                    ...router.query,
                    requestToken,
                },
            },
            undefined,
            { shallow: true }
        )

        let intervalRef: ReturnType<typeof setInterval> | null = null
        const stopPolling = () => {
            if (intervalRef) {
                clearInterval(intervalRef)
                intervalRef = null
            }
            setUpgradePollInterval(null)
        }

        const poll = async () => {
            try {
                const resp = await fetch(`/api/clinic/upgrade-request-status?token=${encodeURIComponent(requestToken)}`, { cache: 'no-store' })
                const data = await resp.json()
                if (!resp.ok) return

                if (data.status === 'approved') {
                    stopPolling()
                    setUpgradeRequestStatus('activating')
                    const queryWithoutToken = { ...router.query }
                    delete (queryWithoutToken as any).requestToken
                    router.replace({ pathname: '/upgrade', query: queryWithoutToken }, undefined, { shallow: true })
                    setTimeout(() => {
                        window.location.href = '/dashboard?upgrade=approved'
                    }, 1800)
                    return
                }

                if (data.status === 'rejected') {
                    stopPolling()
                    setUpgradeRequestStatus('rejected')
                    setError('Your upgrade request was declined by super admin. Please submit a new request or contact support.')
                    const queryWithoutToken = { ...router.query }
                    delete (queryWithoutToken as any).requestToken
                    router.replace({ pathname: '/upgrade', query: queryWithoutToken }, undefined, { shallow: true })
                }
            } catch {
                // Keep polling, transient network errors are expected.
            }
        }

        poll()
        intervalRef = setInterval(poll, 5000)
        setUpgradePollInterval(intervalRef)
    }

    // ── AI OCR purchase handlers ──
    const handleOcrPayDirectly = () => {
        if (isAppRuntime) {
            setOcrError('Payments are handled in browser for mobile/desktop apps. Redirecting...')
            redirectPaymentToBrowser()
            return
        }
        setOcrPaymentMethod('owner')
        setOcrError('')
    }

    const handleOcrPayOnline = async () => {
        if (isAppRuntime) {
            setOcrError('Payments are handled in browser for mobile/desktop apps. Redirecting...')
            await redirectPaymentToBrowser()
            return
        }
        setOcrError('')
        const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
        if (!razorpayKey) {
            setOcrError('Online payment is not configured. Please use "Pay Directly to Owner" option.')
            return
        }

        setOcrPaymentMethod('online')

        if (!(window as any).Razorpay) {
            const script = document.createElement('script')
            script.src = 'https://checkout.razorpay.com/v1/checkout.js'
            script.async = true
            document.body.appendChild(script)
            await new Promise((resolve, reject) => {
                script.onload = resolve
                script.onerror = () => reject(new Error('Failed to load payment gateway'))
            }).catch(() => {
                setOcrError('Failed to load payment gateway. Please check your internet connection.')
                setOcrPaymentMethod(null)
                return
            })
            if (!(window as any).Razorpay) { setOcrPaymentMethod(null); return }
        }

        const options = {
            key: razorpayKey,
            amount: getDiscountedOcrTotal() * 100,
            currency: 'INR',
            name: 'ERP Flow Studios',
            description: `AI Image OCR Add-on — ${ocrAddonTargetLabel}`,
            handler: function (_response: any) {
                handleOcrSubmit(_response?.razorpay_payment_id)
            },
            prefill: {
                name: user?.name || '',
                email: user?.email || '',
                contact: user?.phone || '',
            },
            theme: { color: '#6366f1' },
            modal: {
                ondismiss: function () { setOcrPaymentMethod(null) },
                escape: true,
                confirm_close: true,
            },
        }

        try {
            const rzp = new (window as any).Razorpay(options)
            rzp.on('payment.failed', function (response: any) {
                setOcrError(`Payment failed: ${response.error?.description || 'Unknown error'}. Please try again.`)
                setOcrPaymentMethod(null)
            })
            rzp.open()
        } catch {
            setOcrError('Failed to open payment gateway. Please try again.')
            setOcrPaymentMethod(null)
        }
    }

    const handleOcrSubmit = async (razorpayPaymentId?: string) => {
        setOcrLoading(true)
        setOcrError('')
        try {
            const resp = await fetch('/api/purchase-ai-ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentMethod: ocrPaymentMethod === 'online' ? 'pay_online' : 'pay_to_owner',
                    razorpayPaymentId: razorpayPaymentId || null,
                    couponCode: ocrCouponCode || null,
                })
            })
            if (!resp.ok) {
                const data = await resp.json()
                throw new Error(data.error || 'Request failed')
            }
            setOcrStep('submitted')
        } catch (err: any) {
            setOcrError(err.message || 'Failed to submit request')
        } finally {
            setOcrLoading(false)
        }
    }

    if (authLoading) return null

    if (!user) {
        return (
            <>
                <Head>
                    <title>Upgrade Required | ERP Flow Studios</title>
                </Head>
                <div className="max-w-xl mx-auto px-4 py-12">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
                        <h1 className="text-xl font-bold text-red-800">Trial Expired</h1>
                        <p className="mt-2 text-sm text-red-700">
                            Your clinic trial has ended. Please log in as clinic admin and continue to upgrade.
                        </p>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => router.push(`/login?reason=trial_expired&expired=1${clinicIdFromQuery ? `&clinicId=${encodeURIComponent(clinicIdFromQuery)}` : ''}`)}
                                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold"
                            >
                                Login to Upgrade
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push('/clinic-login')}
                                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium"
                            >
                                Back to Clinic Login
                            </button>
                        </div>
                    </div>
                </div>
            </>
        )
    }

    if (user.role !== 'admin' || !canAccessPage) return null

    if (upgradeRequestStatus === 'activating') {
        return (
            <>
                <Head>
                    <title>Activating Upgrade | ERP Flow Studios</title>
                </Head>
                <div className="min-h-screen flex items-center justify-center px-4 py-10">
                    <div className="max-w-lg w-full rounded-3xl border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-800 shadow-xl p-8 text-center">
                        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Upgrade Approved</h2>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Refreshing your account and loading your upgraded plan...</p>
                    </div>
                </div>
            </>
        )
    }

    if (upgradeRequestStatus === 'pending') {
        return (
            <>
                <Head>
                    <title>Pending Approval | ERP Flow Studios</title>
                </Head>
                <div className="min-h-screen flex items-center justify-center px-4 py-10">
                    <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-5">
                                <svg className="w-10 h-10 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pending Admin Approval</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your upgrade request has been submitted. A verification email has been sent to super admin with approve and decline options.</p>

                            <div className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 mb-6 text-left">
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">Request</p>
                                <p className="text-base font-bold text-amber-600 dark:text-amber-400">{selectedUpgradePlanData.name} · {normalizedCycle === 'fiveYear' ? '5 Year' : 'Annual'}</p>
                            </div>

                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <Dots />
                                Waiting for approval...
                            </div>

                            <button
                                type="button"
                                onClick={() => upgradeRequestToken && startUpgradePolling(upgradeRequestToken)}
                                className="mt-5 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Refresh Status
                            </button>
                        </div>
                    </div>
                </div>
            </>
        )
    }

    return (
        <>
            <SEO
                canonicalPath="/upgrade"
                description="Upgrade your ERP Flow Studios subscription to unlock advanced clinic ERP features, billing controls, analytics, and AI-powered workflows."
                keywords={[
                    'upgrade clinic ERP',
                    'clinic ERP pricing India',
                    'medical ERP system India',
                    'clinic software plans',
                ]}
                openGraph={{
                    description: 'Upgrade your ERP Flow Studios plan to unlock more clinic management features and advanced workflows.',
                }}
            />
            <Head>
                <title>Upgrade Plan | ERP Flow Studios</title>
            </Head>

            <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 text-amber-700 dark:text-amber-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        Upgrade Your Clinic
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
                        Unlock the Full Power of ERP Flow Studios
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                        You're currently on the <span className="font-semibold text-brand">{currentPlan === 'basic_ai_ocr' ? 'Basic + AI OCR' : currentPlan === 'standard_ai_ocr' ? 'Standard + AI OCR' : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</span> plan. Choose <span className="font-semibold text-amber-600 dark:text-amber-400">{currentPlan === 'standard' || currentPlan === 'standard_ai_ocr' ? 'Pro' : 'Standard or Pro'}</span> to continue using your clinic without interruption.
                    </p>
                </div>

                {isUpgradeRequired && (
                    <div className="mb-8 rounded-2xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-5">
                        <h3 className="text-base font-bold text-red-800 dark:text-red-300">Your free trial is over. Plan selection and payment are now required.</h3>
                        <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                            {trialDaysLeftFromQuery > 0
                                ? `Trial ends in ${trialDaysLeftFromQuery} day(s).`
                                : 'Clinic access is currently disabled until upgrade payment is verified.'}
                            {' '}If payment is not completed, your clinic account and data will be permanently deleted after 30 days.
                        </p>
                        {trialEndsAtFromQuery && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Trial ended on: {new Date(trialEndsAtFromQuery).toLocaleDateString()}</p>
                        )}
                    </div>
                )}

                {step === 'plan' && (
                    <>
                        {/* Current Plan Badge */}
                        <div className="mb-8 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-700 rounded-2xl p-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-800 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">
                                        Current Plan: {isBasicAiOcr ? 'Basic + AI OCR' : isStandardAiOcr ? 'Standard + AI OCR' : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                                    </p>
                                    <p className="text-xs text-brand-600 dark:text-brand-400">All core clinic management features included</p>
                                </div>
                            </div>
                        </div>

                        {/* ── Purchase Single Features ── */}
                        {canPurchaseAiOcrAddon && ocrStep === 'idle' && (
                            <div className="mb-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">✨</span>
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Purchase Single Features</h2>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">— Add just what you need</span>
                                </div>

                                <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-700 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6 relative shadow-md shadow-indigo-500/10">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/30">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Image OCR</h3>
                                                    <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full font-medium">Add-on</span>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">High-accuracy Aadhaar &amp; bill scanning with Google Vision + Gemini AI — dramatically better than Tesseract.</p>
                                                <ul className="space-y-1">
                                                    {['Vision OCR for Aadhaar card scanning', 'Vision OCR for purchase bill processing', 'Gemini AI structured data extraction', 'Instant autofill with higher accuracy'].map((f, i) => (
                                                        <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                                            <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            {f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center sm:items-end gap-3 flex-shrink-0">
                                            <div className="text-center sm:text-right">
                                                <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">₹{ocrAddonAmount}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">/year · incl. GST</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setOcrStep('payment')}
                                                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-500/30 transition-all hover:shadow-lg hover:shadow-indigo-500/40"
                                            >
                                                Buy Now
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Already has AI OCR badge */}
                        {(isBasicAiOcr || isStandardAiOcr) && (
                            <div className="mb-8 rounded-2xl border-2 border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">AI Image OCR Active ✓ ({isStandardAiOcr ? 'Standard + AI OCR' : 'Basic + AI OCR'})</p>
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400">You have Vision + Gemini OCR for Aadhaar scanning &amp; bill processing.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* AI OCR Payment step */}
                        {canPurchaseAiOcrAddon && ocrStep === 'payment' && (
                            <div className="mb-8 max-w-lg mx-auto">
                                <button
                                    type="button"
                                    onClick={() => { setOcrStep('idle'); setOcrPaymentMethod(null); setOcrError('') }}
                                    className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-4"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back
                                </button>

                                {/* Order summary */}
                                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-2xl p-5 mb-4">
                                    <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide mb-3">Order Summary — AI Image OCR</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600 dark:text-gray-400">AI Image OCR Add-on (Annual)</span>
                                            <span className="font-medium text-gray-900 dark:text-white">₹{ocrAddonAmount}</span>
                                        </div>
                                        {ocrDiscount > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-emerald-600 dark:text-emerald-400">Coupon Discount</span>
                                                <span className="font-medium text-emerald-600 dark:text-emerald-400">-₹{ocrDiscount}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-indigo-200 dark:border-indigo-700">
                                            <span>Incl. 18% GST</span>
                                            <span>✓</span>
                                        </div>
                                        <div className="flex justify-between text-base font-bold pt-1">
                                            <span className="text-gray-900 dark:text-white">Total</span>
                                            <span className="text-indigo-600 dark:text-indigo-400">₹{getDiscountedOcrTotal()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-4">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Apply Coupon</p>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={ocrCouponCode}
                                            onChange={(e) => setOcrCouponCode(e.target.value.toUpperCase())}
                                            placeholder="Enter coupon code"
                                            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const context = isBasic ? 'ai_ocr_basic' : 'ai_ocr_standard'
                                                    const result = await applyCoupon(context, ocrCouponCode, ocrAddonAmount)
                                                    setOcrDiscount(result.discountAmount)
                                                    setOcrCouponStatus(result.message)
                                                } catch (err: any) {
                                                    setOcrDiscount(0)
                                                    setOcrCouponStatus(err.message || 'Invalid coupon')
                                                }
                                            }}
                                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                    {ocrCouponStatus && <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">{ocrCouponStatus}</p>}
                                </div>

                                {ocrError && (
                                    <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">{ocrError}</div>
                                )}

                                {!ocrPaymentMethod && (
                                    <div className="space-y-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Choose Payment Method</p>

                                        <button type="button" onClick={handleOcrPayOnline}
                                            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-brand-200 dark:border-brand-700 hover:border-brand bg-white dark:bg-gray-800 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all group">
                                            <div className="w-12 h-12 bg-brand-100 dark:bg-brand-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                                <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                            </div>
                                            <div className="text-left flex-1">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Pay Online</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Razorpay · UPI, Card, Net Banking · Requires verification</p>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-400 group-hover:text-brand transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>

                                        <button type="button" onClick={handleOcrPayDirectly}
                                            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-700 hover:border-amber-500 bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all group">
                                            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            </div>
                                            <div className="text-left flex-1">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Pay Directly to Owner</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Manual payment · Requires admin verification &amp; approval</p>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                    </div>
                                )}

                                {ocrPaymentMethod && (
                                    <div className="space-y-4">
                                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-5 h-5 text-amber-700 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Waiting for Verification</h4>
                                                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                                        {ocrPaymentMethod === 'owner'
                                                            ? `After submitting, a verification email will be sent to the super admin. Once your payment is confirmed, your plan will upgrade to ${ocrAddonTargetLabel}.`
                                                            : 'After payment, a verification email will be sent to the super admin to confirm and activate your AI OCR add-on.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <button type="button" onClick={() => setOcrPaymentMethod(null)}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                                Change Method
                                            </button>
                                            <button type="button" onClick={() => handleOcrSubmit()}
                                                disabled={ocrLoading}
                                                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow shadow-indigo-500/30">
                                                {ocrLoading ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Submitting...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Submit &amp; Request Verification</>}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AI OCR submitted confirmation */}
                        {canPurchaseAiOcrAddon && ocrStep === 'submitted' && (
                            <div className="mb-8 max-w-lg mx-auto text-center">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Request Submitted!</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Your AI Image OCR purchase request has been sent to the super admin for verification. Once approved, your plan will automatically upgrade to <strong>{ocrAddonTargetLabel}</strong>.</p>
                                <button type="button" onClick={() => router.push('/dashboard')}
                                    className="px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-dark transition-colors">
                                    Back to Dashboard
                                </button>
                            </div>
                        )}

                        {/* Plan Comparison */}
                        <div className="grid md:grid-cols-3 gap-6 mb-8">
                            {/* Basic Plan Card */}
                            <div className={`rounded-2xl border-2 p-6 relative ${(isBasic || isBasicAiOcr) ? 'border-brand-200 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'}`}>
                                {(isBasic || isBasicAiOcr) && (
                                    <div className="absolute top-3 right-3 bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-300 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                        Current
                                    </div>
                                )}
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Basic</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{basicPlan.description}</p>
                                <ul className="space-y-2">
                                    {basicPlan.features.map((f, i) => (
                                        <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {[PLANS.find(p => p.id === 'standard')!, proPlan].map((plan) => {
                                const isSelected = selectedUpgradePlan === plan.id;
                                const isCurrentPlan = plan.id === 'standard' ? (isStandard || isStandardAiOcr) : currentPlan === plan.id;
                                return (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        disabled={isCurrentPlan}
                                        onClick={() => !isCurrentPlan && setSelectedUpgradePlan(plan.id as 'standard' | 'pro')}
                                        className={`rounded-2xl border-2 p-6 text-left relative transition-all shadow-lg ${
                                            isSelected
                                                ? 'border-amber-400 dark:border-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 shadow-amber-500/20'
                                                : isCurrentPlan
                                                    ? 'border-brand-200 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-900/10 cursor-not-allowed'
                                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300 dark:hover:border-amber-600'
                                        }`}
                                    >
                                        {isCurrentPlan && (
                                            <span className="absolute top-3 right-3 bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-300 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                                Current
                                            </span>
                                        )}
                                        {isSelected && (
                                            <span className="absolute top-3 right-3 bg-amber-500 text-white px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                                Selected
                                            </span>
                                        )}
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{plan.name}</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>
                                        <ul className="space-y-2.5">
                                            {plan.features.slice(0, 7).map((f, i) => (
                                                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                                                    <span className="text-brand">✓</span>
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Billing Cycle Selector */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 mb-6">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Select Billing Cycle for {selectedUpgradePlanData.name} Plan</h3>
                            <div className="flex flex-wrap gap-2">
                                {BILLING_CYCLES.map(bc => (
                                    <button
                                        key={bc.key}
                                        type="button"
                                        onClick={() => handleCycleSelection(bc.key)}
                                        title={isBillingCycleLocked(bc.key) ? MINIMUM_SUBSCRIPTION_TOOLTIP : undefined}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                            normalizedCycle === bc.key
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20'
                                                : isBillingCycleLocked(bc.key)
                                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            {isBillingCycleLocked(bc.key) && <span aria-hidden="true">🔒</span>}
                                            <span>{bc.label}</span>
                                            {isBillingCycleLocked(bc.key) && (
                                                <span className="hidden sm:inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                    Requires 1 Year Plan
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{MINIMUM_SUBSCRIPTION_TOOLTIP}</p>

                            {/* Price display */}
                            <div className="mt-4 flex items-baseline gap-2">
                                <span className="text-3xl font-extrabold text-gray-900 dark:text-white">₹{getPlanPrice().toLocaleString('en-IN')}</span>
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {isFiveYear ? 'one-time' : BILLING_CYCLES.find(b => b.key === normalizedCycle)?.shortLabel}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                                    {isFiveYear ? '(GST inclusive)' : '+ 18% GST'}
                                </span>
                            </div>
                            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Minimum subscription: 1 Year</p>

                            {/* Savings badge */}
                            {normalizedCycle !== 'annual' && (
                                <p className="mt-3 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-1.5 inline-block">
                                    💰 Save ₹{((selectedUpgradePlanData.prices.monthly * (normalizedCycle === 'fiveYear' ? 60 : 12)) - selectedUpgradePlanData.prices[normalizedCycle as keyof typeof selectedUpgradePlanData.prices]).toLocaleString('en-IN')} vs monthly
                                </p>
                            )}
                        </div>

                        {/* CTA */}
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => setStep('payment')}
                                className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-2xl shadow-lg shadow-amber-500/20 transition-all text-sm flex items-center gap-2"
                            >
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                    Proceed to Payment
                                </>
                            </button>
                        </div>
                    </>
                )}

                {step === 'payment' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Back button */}
                        <button
                            type="button"
                            onClick={() => { setStep('plan'); setPaymentMethod(null); setError('') }}
                            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            Back to Plan Selection
                        </button>

                        {/* Order Summary */}
                        {(() => {
                            const basePrice = getBasePrice()
                            const gst = getGstAmount()
                            const planTotal = getPlanTotal()
                            const discountedPlanTotal = getDiscountedUpgradePlanTotal()
                            const platformCharges = getRazorpayCommission(discountedPlanTotal)
                            const grandTotal = getGrandTotal(discountedPlanTotal)
                            const cycleName = BILLING_CYCLES.find(b => b.key === normalizedCycle)?.label

                            return (
                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 space-y-4">
                                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Order Summary — Upgrade to {selectedUpgradePlanData.name}</h4>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedUpgradePlanData.name} Plan</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{cycleName} billing</p>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">₹{basePrice.toLocaleString('en-IN')}</span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">GST (18%)</p>
                                            <span className="text-sm text-gray-600 dark:text-gray-400">₹{gst.toLocaleString('en-IN')}</span>
                                        </div>

                                        <div className="border-t border-amber-200 dark:border-amber-700 pt-3 flex items-center justify-between">
                                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Plan Price {isFiveYear ? '(GST inclusive)' : ''}</p>
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">₹{planTotal.toLocaleString('en-IN')}</span>
                                        </div>

                                        {upgradeDiscount > 0 && (
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm text-emerald-600 dark:text-emerald-400">Coupon Discount</p>
                                                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">-₹{upgradeDiscount.toLocaleString('en-IN')}</span>
                                            </div>
                                        )}

                                        {/* Platform Charges */}
                                        <div className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-3 space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Platform Charges</p>
                                                    <div className="group relative">
                                                        <svg className="w-3.5 h-3.5 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-lg z-10">
                                                            Razorpay transaction fee (2%) + GST (18%) on commission
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-sm text-gray-600 dark:text-gray-400">₹{platformCharges.total.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5 pl-1">
                                                <p>Gateway fee (2%): ₹{platformCharges.commission.toLocaleString('en-IN')}</p>
                                                <p>GST on fee (18%): ₹{platformCharges.commissionGst.toLocaleString('en-IN')}</p>
                                            </div>
                                        </div>

                                        {/* Grand Total */}
                                        <div className="border-t-2 border-amber-300 dark:border-amber-600 pt-3 flex items-center justify-between">
                                            <p className="text-base font-bold text-gray-900 dark:text-white">Total Payable</p>
                                            <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400">₹{grandTotal.toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>

                                    {isFiveYear && (
                                        <div className="flex items-start gap-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-3">
                                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                                Annual maintenance: <span className="font-semibold">₹{ANNUAL_MAINTENANCE.toLocaleString('en-IN')}/year</span> (+ platform charges) applies during and after the 5-year plan period.
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-1">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                        <span>Secure payment · SSL encrypted · All prices in INR</span>
                                    </div>
                                </div>
                            )
                        })()}

                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Apply Coupon</p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={upgradeCouponCode}
                                    onChange={(e) => setUpgradeCouponCode(e.target.value.toUpperCase())}
                                    placeholder="Enter coupon code"
                                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            const result = await applyCoupon('upgrade_plan', upgradeCouponCode, getPlanTotal())
                                            setUpgradeDiscount(result.discountAmount)
                                            setUpgradeCouponStatus(result.message)
                                        } catch (err: any) {
                                            setUpgradeDiscount(0)
                                            setUpgradeCouponStatus(err.message || 'Invalid coupon')
                                        }
                                    }}
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
                                >
                                    Apply
                                </button>
                            </div>
                            {upgradeCouponStatus && <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">{upgradeCouponStatus}</p>}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {/* Payment Options */}
                        {!paymentMethod && (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Choose Payment Method</p>

                                {/* Pay Online */}
                                <button
                                    type="button"
                                    onClick={handlePayOnline}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-brand-200 dark:border-brand-700 hover:border-brand dark:hover:border-brand bg-white dark:bg-gray-800 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all group"
                                >
                                    <div className="w-12 h-12 bg-brand-100 dark:bg-brand-900/30 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-200 dark:group-hover:bg-brand-800/40 transition-colors">
                                        <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Pay Online</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Razorpay (UPI, Card, Net Banking) · Requires admin verification</p>
                                    </div>
                                    <svg className="w-5 h-5 text-gray-400 group-hover:text-brand transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>

                                {/* Pay to Owner */}
                                <button
                                    type="button"
                                    onClick={handlePayDirectly}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-700 hover:border-amber-500 dark:hover:border-amber-500 bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all group"
                                >
                                    <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 dark:group-hover:bg-amber-800/40 transition-colors">
                                        <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Pay Directly to Owner</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Manual payment · Requires admin verification & approval</p>
                                    </div>
                                    <svg className="w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>

                            </div>
                        )}

                        {/* Owner Payment flow */}
                        {paymentMethod === 'owner' && (
                            <div className="space-y-4">
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-amber-200 dark:bg-amber-800 rounded-full flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-amber-700 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Manual Payment Verification</h4>
                                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                                After submitting your upgrade request, a verification email will be sent to the super admin. 
                                                Once payment is confirmed and approved, your clinic will be upgraded to {selectedUpgradePlanData.name} automatically.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">How it works:</h4>
                                    <ol className="space-y-2.5">
                                        {[
                                            'Submit your upgrade request',
                                            'Super admin receives a verification email',
                                            'Make payment directly to the clinic owner',
                                            'Super admin verifies & upgrades your plan',
                                            `${selectedUpgradePlanData.name} features unlock instantly`
                                        ].map((s, i) => (
                                            <li key={i} className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
                                                <span className="text-sm text-gray-600 dark:text-gray-400 pt-0.5">{s}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod(null)}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                        Change Method
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleUpgradeSubmit('pay_to_owner')}
                                        disabled={loading}
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow shadow-amber-500/30"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        Submit &amp; Request Verification
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showMinimumPlanNotice && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowMinimumPlanNotice(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">Minimum Commitment Required</h4>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            This plan requires a minimum commitment of 1 year.
                        </p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{MINIMUM_SUBSCRIPTION_TOOLTIP}</p>
                        <div className="mt-5 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowMinimumPlanNotice(false)}
                                className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setBillingCycle('annual')
                                    setShowMinimumPlanNotice(false)
                                }}
                                className="flex-1 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                            >
                                Continue with 1 Year Plan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default UpgradePage

function Dots() {
    return (
        <>
            <span className="inline-flex items-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
        </>
    )
}
