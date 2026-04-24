import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { isBillingCycleLocked, MINIMUM_SUBSCRIPTION_TOOLTIP, normalizeBillingCycleWithMinimum } from '../lib/subscriptionBilling'

const STEP_LABELS = ['Clinic Info', 'Security', 'Branding Setup', 'Location', 'Select Plan', 'Payment']

const BILLING_CYCLES = [
    { key: 'monthly', label: 'Monthly', shortLabel: '/mo' },
    { key: 'quarterly', label: '3 Months', shortLabel: '/3 mo' },
    { key: 'annual', label: '1 Year', shortLabel: '/yr' },
    { key: 'fiveYear', label: '5-Year Plan', shortLabel: 'one-time' },
]

// For monthly/quarterly/annual: prices are base prices, 18% GST is added on top.
// For fiveYear: prices are GST-inclusive (base + 18% GST = displayed price).
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
            'All Basic Features +',
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

const ANNUAL_MAINTENANCE = 4999 // ₹4,999/year during and after 5-year plan period
const RAZORPAY_COMMISSION_RATE = 0.02 // 2%
const RAZORPAY_COMMISSION_GST = 0.18   // 18% GST on Razorpay commission

export default function RegisterClinic() {
    const router = useRouter()
    const [step, setStep] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [clinicId, setClinicId] = useState('')
    const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'pending' | 'activating' | 'activated'>('idle')
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
    const [resendLoading, setResendLoading] = useState(false)
    const [resendMessage, setResendMessage] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const [formData, setFormData] = useState({
        clinicName: '',
        adminName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        address: '',
        city: '',
        state: ''
    })

    const [locationLat, setLocationLat] = useState<number | null>(null)
    const [locationLng, setLocationLng] = useState<number | null>(null)
    const [locationName, setLocationName] = useState('')
    const [locationRadius, setLocationRadius] = useState(300)
    const [locationLoading, setLocationLoading] = useState(false)
    const [locationError, setLocationError] = useState('')
    const [locationMode, setLocationMode] = useState<'auto' | 'manual'>('auto')
    const [locationSearch, setLocationSearch] = useState('')
    const [locationSearchLoading, setLocationSearchLoading] = useState(false)
    const [locationSearchResults, setLocationSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([])
    const [showLocationResults, setShowLocationResults] = useState(false)
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
    const [billingCycle, setBillingCycle] = useState('annual')
    const [showMinimumPlanNotice, setShowMinimumPlanNotice] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState<'owner' | 'online' | null>(null)
    const [trialStatusMessage, setTrialStatusMessage] = useState('')
    const [trialAlreadyAvailed, setTrialAlreadyAvailed] = useState(false)
    const [couponCode, setCouponCode] = useState('')
    const [couponDiscount, setCouponDiscount] = useState(0)
    const [couponStatus, setCouponStatus] = useState('')

    useEffect(() => {
        return () => { if (pollingInterval) clearInterval(pollingInterval) }
    }, [pollingInterval])

    const handleCycleSelection = (nextCycle: string) => {
        if (isBillingCycleLocked(nextCycle)) {
            setShowMinimumPlanNotice(true)
            return
        }
        setBillingCycle(nextCycle)
    }

    // ─── Polling ──────────────────────────────────────────────────────────────
    const startPolling = (clinicIdToCheck: string) => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/clinic/check-status?clinicId=${clinicIdToCheck}`)
                const data = await response.json()
                if (data.status === 'approved' || data.status === 'activated') {
                    clearInterval(interval)
                    setPollingInterval(null)
                    setRegistrationStatus('activating')
                    setTimeout(() => {
                        setRegistrationStatus('activated')
                        setSuccessMessage(`Clinic activated! Access Code: ${clinicIdToCheck}`)
                    }, 2000)
                } else if (data.status === 'expired') {
                    clearInterval(interval)
                    setPollingInterval(null)
                    setRegistrationStatus('idle')
                    setError('Registration request has expired. Please try again.')
                }
            } catch { }
        }, 5000)
        setPollingInterval(interval)
    }

    // ─── Resend verification ──────────────────────────────────────────────────
    const handleResendVerification = async () => {
        setResendLoading(true)
        setResendMessage('')
        setError('')
        try {
            const res = await fetch('/api/clinic/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to resend verification email')
            setResendMessage('Verification email resent to super admin.')
        } catch (err: any) {
            setError(err.message || 'Failed to resend verification email')
        } finally {
            setResendLoading(false)
        }
    }

    // ─── Input handlers ───────────────────────────────────────────────────────
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
        setError('')
    }

    const checkTrialStatus = async (emailValue: string) => {
        const email = String(emailValue || '').trim().toLowerCase()
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setTrialStatusMessage('')
            setTrialAlreadyAvailed(false)
            return
        }
        try {
            const response = await fetch(`/api/clinic/trial-status?email=${encodeURIComponent(email)}`)
            const data = await response.json()
            if (response.ok) {
                setTrialAlreadyAvailed(Boolean(data.trialAvailed))
                setTrialStatusMessage(data.message || '')
            }
        } catch {
            setTrialStatusMessage('')
        }
    }

    // ─── Geolocation ─────────────────────────────────────────────────────────
    const handleDetectLocation = () => {
        if (!navigator.geolocation) { setLocationError('Geolocation is not supported by your browser'); return }
        setLocationLoading(true)
        setLocationError('')
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude
                const lng = position.coords.longitude
                setLocationLat(lat); setLocationLng(lng)
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
                    const data = await res.json()
                    setLocationName(data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
                } catch { setLocationName(`${lat.toFixed(5)}, ${lng.toFixed(5)}`) }
                setLocationLoading(false)
            },
            () => { setLocationError('Could not detect location. Please allow location access.'); setLocationLoading(false) },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const handleSearchLocation = async () => {
        if (!locationSearch.trim()) return
        setLocationSearchLoading(true)
        setLocationError('')
        setShowLocationResults(false)
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&limit=5`, { headers: { 'Accept-Language': 'en' } })
            const results = await res.json()
            setLocationSearchResults(results || [])
            setShowLocationResults(true)
            if (!results.length) setLocationError('No results found. Try a more specific address.')
        } catch { setLocationError('Search failed. Please try again.') }
        finally { setLocationSearchLoading(false) }
    }

    const handleSelectSearchResult = (result: { display_name: string; lat: string; lon: string }) => {
        setLocationLat(parseFloat(result.lat))
        setLocationLng(parseFloat(result.lon))
        setLocationName(result.display_name)
        setShowLocationResults(false)
        setLocationSearch(result.display_name)
        setLocationError('')
    }

    const handleClearLocation = () => {
        setLocationLat(null); setLocationLng(null)
        setLocationName(''); setLocationRadius(300); setLocationError('')
    }

    // ─── Step navigation ──────────────────────────────────────────────────────
    const validateStep = (): string => {
        if (step === 0) {
            if (!formData.clinicName.trim()) return 'Clinic name is required'
            if (!formData.adminName.trim()) return 'Admin name is required'
            if (!formData.email.trim()) return 'Email is required'
            if (!formData.phone.trim()) return 'Phone number is required'
            if (!/^\d{10}$/.test(formData.phone)) return 'Enter a valid 10-digit phone number'
        }
        if (step === 1) {
            if (!formData.password) return 'Password is required'
            if (formData.password.length < 8) return 'Password must be at least 8 characters'
            if (formData.password !== formData.confirmPassword) return 'Passwords do not match'
        }
        if (step === 4) {
            if (!selectedPlan) return 'Please select a plan to continue'
        }
        return ''
    }

    const goNext = () => {
        const err = validateStep()
        if (err) { setError(err); return }
        setError('')
        setStep(s => s + 1)
    }

    const goBack = () => { setError(''); setStep(s => s - 1) }

    // ─── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const response = await fetch('/api/clinic/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    locationLat,
                    locationLng,
                    locationName,
                    locationRadius,
                    selectedPlan,
                    billingCycle: normalizeBillingCycleWithMinimum(billingCycle),
                    paymentMethod,
                    couponCode: couponCode || null,
                })
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Registration failed')

            if (data.status === 'pending') {
                setClinicId(data.clinicId)
                setRegistrationStatus('pending')
                setLoading(false)
                startPolling(data.clinicId)
                return
            }

            setSuccessMessage(`Clinic registered successfully!`)
            setClinicId(data.clinicId)
            setRegistrationStatus('activated')
            setLoading(false)
        } catch (err: any) {
            setError(err.message || 'Failed to register clinic')
            setLoading(false)
        }
    }

    // ─── Shared class ─────────────────────────────────────────────────────────
    const inputCls = 'w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all text-sm'

    // ─── Payment helpers ──────────────────────────────────────────────────────
    const getSelectedPlanData = () => PLANS.find(p => p.id === selectedPlan)
    const normalizedBillingCycle = normalizeBillingCycleWithMinimum(billingCycle)
    const isFiveYear = normalizedBillingCycle === 'fiveYear'
    const getPlanPrice = () => {
        const plan = getSelectedPlanData()
        if (!plan) return 0
        return plan.prices[normalizedBillingCycle as keyof typeof plan.prices]
    }
    // For fiveYear: price is GST-inclusive, so base = price / 1.18, GST = price - base
    // For others: price is base, GST = price * 0.18
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
        if (isFiveYear) return getPlanPrice() // GST-inclusive
        return getPlanPrice() + getGstAmount()
    }
    // Razorpay platform charges: 2% + 18% GST on that commission
    const getRazorpayCommission = (planTotal?: number) => {
        const effectivePlanTotal = typeof planTotal === 'number' ? planTotal : getPlanTotal()
        const commission = Math.round(effectivePlanTotal * RAZORPAY_COMMISSION_RATE)
        const commissionGst = Math.round(commission * RAZORPAY_COMMISSION_GST)
        return { commission, commissionGst, total: commission + commissionGst }
    }
    const getDiscountedPlanTotal = () => Math.max(0, getPlanTotal() - couponDiscount)
    const getTotalAmount = () => getDiscountedPlanTotal()
    const getGrandTotal = () => getDiscountedPlanTotal() + getRazorpayCommission(getDiscountedPlanTotal()).total

    const handleApplyCoupon = async () => {
        try {
            const response = await fetch('/api/coupons/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: 'register_plan', code: couponCode, amount: getPlanTotal() })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Invalid coupon')
            setCouponDiscount(Number(data.discountAmount || 0))
            setCouponStatus(data.message || 'Coupon applied')
        } catch (err: any) {
            setCouponDiscount(0)
            setCouponStatus(err.message || 'Invalid coupon')
        }
    }

    const handlePayDirectly = () => {
        setPaymentMethod('owner')
        setError('')
    }

    const handlePayOnline = async () => {
        setError('')
        const amount = getTotalAmount()
        const plan = getSelectedPlanData()
        const platformCharges = getRazorpayCommission(amount)

        // Check if Razorpay key is configured
        const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
        if (!razorpayKey) {
            setError('Online payment is not configured yet. Please use "Pay Directly to Owner" option or contact support.')
            return
        }

        setPaymentMethod('online')

        // Load Razorpay script if not already loaded
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
            amount: (amount + platformCharges.total) * 100, // Razorpay works in paise — includes plan + platform charges
            currency: 'INR',
            name: 'ERP Flow Studios',
            description: `${plan?.name} Plan - ${BILLING_CYCLES.find(b => b.key === normalizedBillingCycle)?.label} (incl. platform charges ₹${platformCharges.total})`,
            handler: function (response: any) {
                // Payment successful — proceed to submit registration
                handleSubmit()
            },
            prefill: {
                name: formData.adminName,
                email: formData.email,
                contact: formData.phone,
            },
            theme: { color: '#0ea5e9' },
            modal: {
                ondismiss: function () {
                    setPaymentMethod(null)
                },
                escape: true,
                confirm_close: true
            },
            retry: { enabled: true, max_count: 3 }
        }

        try {
            const rzp = new (window as any).Razorpay(options)
            rzp.on('payment.failed', function (response: any) {
                setError(`Payment failed: ${response.error?.description || 'Unknown error'}. Please try again.`)
                setPaymentMethod(null)
            })
            rzp.open()
        } catch (err) {
            setError('Failed to open payment gateway. Please try again.')
            setPaymentMethod(null)
        }
    }

    const handleConfirmOwnerPayment = () => {
        // Submit registration with "owner" payment method — triggers verification email to super admin
        handleSubmit()
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST-SUBMIT SCREENS
    // ═══════════════════════════════════════════════════════════════════════════

    if (loading) return (
        <PageShell>
            <StatusCard>
                <Spinner color="blue" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-2">Setting Up Your Clinic…</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Creating your clinic account…
                </p>
            </StatusCard>
        </PageShell>
    )

    if (registrationStatus === 'activating') return (
        <PageShell>
            <StatusCard>
                <Spinner color="green" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-2">Clinic Approved! 🎉</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Activating your clinic account…</p>
            </StatusCard>
        </PageShell>
    )

    if (registrationStatus === 'pending') return (
        <PageShell>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 max-w-lg mx-auto">
                <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-5">
                        <svg className="w-10 h-10 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pending Admin Approval</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your registration has been submitted. A verification email has been sent to the super admin.</p>

                    <div className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 mb-6 text-left">
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">Clinic</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formData.clinicName}</p>
                    </div>

                    {error && (
                        <div className="w-full mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                            {error}
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
    )

    if (registrationStatus === 'activated' || successMessage) return (
        <PageShell>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 max-w-lg mx-auto">
                <div className="flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-5">
                        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Registration Successful!</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your clinic is ready. Save your access code below.</p>

                    <div className="w-full bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-900/20 border-2 border-brand-400 rounded-2xl p-6 mb-6">
                        <p className="text-xs text-brand-600 dark:text-brand-400 font-semibold uppercase tracking-widest mb-2">Clinic Access Code</p>
                        <p className="text-5xl font-mono font-bold text-brand-700 dark:text-brand-300 tracking-widest">{clinicId}</p>
                        <p className="text-xs text-gray-400 mt-3">⚠️ Save this code — you&apos;ll need it to log in</p>
                    </div>

                    <button
                        onClick={() => router.push(`/clinic/${clinicId}/branding`)}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-brand/30"
                    >
                        Continue To Branding Setup
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </button>
                </div>
            </div>
        </PageShell>
    )

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN MULTI-STEP FORM
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <>
            <Head><title>Register Your Clinic | ERP Flow Studios</title></Head>

            <div className="min-h-screen py-10 px-4">
                    <div className="max-w-4xl mx-auto">

                    {/* ── Header ── */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-700 shadow-lg shadow-brand/30 mb-5">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">Register Your Clinic</h1>
                        <p className="text-gray-500 dark:text-gray-400 text-base max-w-md mx-auto">
                            Get a branded clinic management system with custom prescription templates.
                        </p>
                    </div>

                    {/* ── Step indicator ── */}
                    <div className="mb-8 overflow-x-auto">
                        <div className="flex items-center justify-center min-w-max px-2">
                        {STEP_LABELS.map((label, i) => (
                            <div key={i} className="flex items-center">
                                <div className="flex flex-col items-center">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                                        i < step   ? 'bg-brand-600 border-brand-600 text-white'
                                        : i === step ? 'bg-white dark:bg-gray-800 border-brand text-brand-600 shadow shadow-brand-200'
                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                                    }`}>
                                        {i < step
                                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            : i + 1
                                        }
                                    </div>
                                    <span className={`mt-1.5 text-xs font-medium whitespace-nowrap ${i === step ? 'text-brand-600' : 'text-gray-400'}`}>{label}</span>
                                </div>
                                {i < STEP_LABELS.length - 1 && (
                                    <div className={`h-0.5 w-14 sm:w-20 mx-1 mb-5 rounded transition-all ${i < step ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                )}
                            </div>
                        ))}
                        </div>
                    </div>

                    {/* ── Form card ── */}
                    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl shadow-gray-200/60 dark:shadow-gray-900/60 overflow-hidden">

                        {/* Global error banner */}
                        {error && (
                            <div className="mx-6 mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl px-4 py-3 flex items-start gap-3">
                                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            STEP 0 — Clinic & Admin Info
                        ══════════════════════════════════════════════════════ */}
                        {step === 0 && (
                            <div className="p-6 sm:p-8 space-y-5">
                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                                    title="Clinic &amp; Admin Details"
                                />

                                <Field label="Clinic Name" required>
                                    <input type="text" name="clinicName" value={formData.clinicName} onChange={handleInputChange} required className={inputCls} placeholder="e.g., City Medical Centre" />
                                </Field>

                                <div className="grid sm:grid-cols-2 gap-4">
                                    <Field label="Admin Name" required>
                                        <input type="text" name="adminName" value={formData.adminName} onChange={handleInputChange} required className={inputCls} placeholder="Dr. John Smith" />
                                    </Field>
                                    <Field label="Admin Email" required>
                                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} onBlur={(e) => checkTrialStatus(e.target.value)} required className={inputCls} placeholder="admin@yourclinic.com" />
                                        {trialStatusMessage && (
                                            <p className={`mt-1 text-xs ${trialAlreadyAvailed ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                {trialStatusMessage}
                                            </p>
                                        )}
                                    </Field>
                                </div>

                                <Field label="Admin Phone" required hint="10-digit mobile number without country code">
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} required pattern="[0-9]{10}" className={inputCls} placeholder="9876543210" />
                                </Field>

                                <div className="border-t border-gray-100 dark:border-gray-700 pt-1" />

                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                                    title="Clinic Address"
                                    optional
                                />

                                <Field label="Street Address">
                                    <input type="text" name="address" value={formData.address} onChange={handleInputChange} className={inputCls} placeholder="123 Main Street, Building 5" />
                                </Field>

                                <div className="grid sm:grid-cols-2 gap-4">
                                    <Field label="City">
                                        <input type="text" name="city" value={formData.city} onChange={handleInputChange} className={inputCls} placeholder="Mumbai" />
                                    </Field>
                                    <Field label="State">
                                        <input type="text" name="state" value={formData.state} onChange={handleInputChange} className={inputCls} placeholder="Maharashtra" />
                                    </Field>
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            STEP 1 — Security
                        ══════════════════════════════════════════════════════ */}
                        {step === 1 && (
                            <div className="p-6 sm:p-8 space-y-5">
                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                                    title="Set Your Password"
                                />

                                <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 rounded-2xl px-4 py-3 text-sm text-brand-700 dark:text-brand-300">
                                    This password will be used for the <strong>admin account</strong> associated with <strong>{formData.email || 'your email'}</strong>.
                                </div>

                                <Field label="Password" required hint="Minimum 8 characters">
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleInputChange}
                                            required
                                            minLength={8}
                                            className={`${inputCls} pr-11`}
                                            placeholder="••••••••"
                                        />
                                        <ToggleEye show={showPassword} onToggle={() => setShowPassword(v => !v)} />
                                    </div>
                                </Field>

                                {formData.password && <PasswordStrength password={formData.password} />}

                                <Field label="Confirm Password" required>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleInputChange}
                                            required
                                            minLength={8}
                                            className={`${inputCls} pr-11`}
                                            placeholder="••••••••"
                                        />
                                        <ToggleEye show={showConfirmPassword} onToggle={() => setShowConfirmPassword(v => !v)} />
                                    </div>
                                    {formData.confirmPassword && (
                                        formData.password !== formData.confirmPassword
                                            ? <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg> Passwords do not match</p>
                                            : <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> Passwords match</p>
                                    )}
                                </Field>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            STEP 2 — Branding Setup
                        ══════════════════════════════════════════════════════ */}
                        {step === 2 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                    title="Prescription Branding Setup"
                                    optional
                                />
                                <div className="rounded-2xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4 text-sm text-blue-800 dark:text-blue-200 space-y-2">
                                    <p className="font-semibold">Prescription template is now configured after activation.</p>
                                    <p>
                                        Continue registration now. After payment and activation, you will be redirected to the new Branding page where you can:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Upload header, footer, signature, and watermark images</li>
                                        <li>Use the Template Builder to design your prescription layout</li>
                                        <li>Preview final A4 output before saving</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            STEP 3 — Location
                        ══════════════════════════════════════════════════════ */}
                        {step === 3 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                                    title="Clinic Location"
                                    optional
                                />

                                <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-700 rounded-2xl px-4 py-3.5 text-xs text-brand-700 dark:text-brand-300 space-y-1 -mt-3">
                                    <p className="font-semibold">ℹ️ What does adding a location do?</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>Staff can only log in from within the set radius.</li>
                                        <li>Users outside can request 30-min temporary access.</li>
                                        <li>Manage locations anytime in <strong>Clinic Settings</strong>.</li>
                                        <li><strong>Without a location there is no geo-restriction.</strong></li>
                                    </ul>
                                </div>

                                {!locationLat ? (
                                    <div className="space-y-3">
                                        {/* Mode toggle */}
                                        <div className="flex gap-2">
                                            <button type="button"
                                                onClick={() => { setLocationMode('auto'); setLocationError(''); setShowLocationResults(false) }}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${locationMode === 'auto' ? 'border-brand bg-brand-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                GPS Auto-detect
                                            </button>
                                            <button type="button"
                                                onClick={() => { setLocationMode('manual'); setLocationError(''); setShowLocationResults(false) }}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${locationMode === 'manual' ? 'border-brand bg-brand-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                Search Address
                                            </button>
                                        </div>

                                        {locationMode === 'auto' ? (
                                            <div className="flex flex-col items-center gap-2 py-4">
                                                <button type="button" onClick={handleDetectLocation} disabled={locationLoading}
                                                    className="inline-flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow shadow-brand/30">
                                                    {locationLoading
                                                        ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                    }
                                                    {locationLoading ? 'Detecting…' : 'Use My Current Location'}
                                                </button>
                                                <p className="text-xs text-gray-400">Uses device GPS · No API key required</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex gap-2">
                                                    <input type="text" value={locationSearch}
                                                        onChange={e => { setLocationSearch(e.target.value); setShowLocationResults(false) }}
                                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearchLocation())}
                                                        placeholder="123 Main Street, Mumbai"
                                                        className={inputCls}
                                                    />
                                                    <button type="button" onClick={handleSearchLocation} disabled={locationSearchLoading || !locationSearch.trim()}
                                                        className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex-shrink-0 transition-colors">
                                                        {locationSearchLoading
                                                            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                            : 'Search'
                                                        }
                                                    </button>
                                                </div>
                                                {showLocationResults && locationSearchResults.length > 0 && (
                                                    <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-lg">
                                                        {locationSearchResults.map((r, i) => (
                                                            <button key={i} type="button" onClick={() => handleSelectSearchResult(r)}
                                                                className="w-full text-left px-3 py-2.5 text-xs hover:bg-brand-50 dark:hover:bg-brand-900/20 border-b border-gray-100 dark:border-gray-700 last:border-0 text-gray-700 dark:text-gray-300 transition-colors">
                                                                <div className="flex items-start gap-2">
                                                                    <svg className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                    <span className="truncate">{r.display_name}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-2xl px-4 py-3">
                                            <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-green-700 dark:text-green-400">Location Set</p>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 break-words mt-0.5">{locationName || `${locationLat.toFixed(5)}, ${locationLng?.toFixed(5)}`}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">GPS: {locationLat.toFixed(6)}, {locationLng?.toFixed(6)}</p>
                                            </div>
                                            <button type="button" onClick={handleClearLocation} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Access Radius: <span className="text-brand-600 dark:text-brand-400 font-bold">{locationRadius}m</span>
                                                <span className="ml-1.5 text-xs font-normal text-gray-400">
                                                    {locationRadius <= 100 ? '(single room)' : locationRadius <= 300 ? '(building size)' : locationRadius <= 500 ? '(clinic campus)' : locationRadius <= 1000 ? '(entire block)' : '(large area)'}
                                                </span>
                                            </label>
                                            <input type="range" min={50} max={2000} step={50} value={locationRadius} onChange={e => setLocationRadius(parseInt(e.target.value))}
                                                className="w-full h-2 bg-brand-200 dark:bg-brand-800 rounded-full appearance-none cursor-pointer accent-brand-600" />
                                            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>50m</span><span>1km</span><span>2km</span></div>
                                        </div>

                                        <p className="text-xs text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 rounded-xl px-3 py-2.5">
                                            🔒 Staff can only log in from within <strong>{locationRadius}m</strong> of this location. You can add more locations later in clinic settings.
                                        </p>
                                    </div>
                                )}

                                {locationError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                        {locationError}
                                    </p>
                                )}
                            </div>
                        )}


                        {/* ══════════════════════════════════════════════════════
                            STEP 4 — Select Plan
                        ══════════════════════════════════════════════════════ */}
                        {step === 4 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>}
                                    title="Choose Your Plan"
                                />

                                {/* Billing cycle toggle */}
                                <div className="flex justify-center">
                                    <div className="inline-flex flex-wrap justify-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-2xl p-1.5 w-full sm:w-auto">
                                        {BILLING_CYCLES.map(bc => (
                                            <button
                                                key={bc.key}
                                                type="button"
                                                onClick={() => handleCycleSelection(bc.key)}
                                                title={isBillingCycleLocked(bc.key) ? MINIMUM_SUBSCRIPTION_TOOLTIP : undefined}
                                                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                                                    normalizedBillingCycle === bc.key
                                                        ? 'bg-brand-600 text-white shadow-md'
                                                        : isBillingCycleLocked(bc.key)
                                                            ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'
                                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
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
                                </div>
                                <p className="text-center text-xs text-gray-500 dark:text-gray-400 -mt-2">{MINIMUM_SUBSCRIPTION_TOOLTIP}</p>

                                {/* Plan cards */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                                    {PLANS.map(plan => {
                                        const price = plan.prices[normalizedBillingCycle as keyof typeof plan.prices]
                                        const isSelected = selectedPlan === plan.id
                                        const isFiveYear = normalizedBillingCycle === 'fiveYear'

                                        return (
                                            <button
                                                key={plan.id}
                                                type="button"
                                                onClick={() => setSelectedPlan(plan.id)}
                                                className={`text-left rounded-2xl overflow-hidden border-2 p-5 transition-all h-full flex flex-col ${
                                                    isSelected
                                                        ? 'border-brand bg-brand-50 dark:bg-brand-900/20 shadow-lg shadow-brand/10 ring-1 ring-brand-400'
                                                        : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-md'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h4>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{plan.description}</p>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="w-6 h-6 bg-brand-600 rounded-full flex items-center justify-center flex-shrink-0">
                                                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-baseline gap-1 mb-1">
                                                    <span className="text-3xl font-extrabold text-gray-900 dark:text-white">₹{price.toLocaleString('en-IN')}</span>
                                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                                        {isFiveYear ? 'one-time' : BILLING_CYCLES.find(b => b.key === normalizedBillingCycle)?.shortLabel}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                                                    {isFiveYear ? 'GST inclusive' : '+ 18% GST'}
                                                </p>
                                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-4 -mt-2">
                                                    Minimum subscription: 1 Year
                                                </p>

                                                <ul className="space-y-2 mt-auto pt-2">
                                                    {plan.features.map((f, i) => (
                                                        <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                            <svg className="w-3.5 h-3.5 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            {f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </button>
                                        )
                                    })}
                                </div>

                                {normalizedBillingCycle !== 'annual' && (
                                    <p className="text-xs text-center text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl px-3 py-2">
                                        💰 You save{' '}
                                        {selectedPlan
                                            ? `₹${((PLANS.find(p => p.id === selectedPlan)?.prices.monthly ?? 0) * (normalizedBillingCycle === 'fiveYear' ? 60 : 12) - (PLANS.find(p => p.id === selectedPlan)?.prices[normalizedBillingCycle as keyof typeof PLANS[0]['prices']] ?? 0)).toLocaleString('en-IN')}`
                                            : 'more'
                                        }{' '}
                                        compared to monthly billing{normalizedBillingCycle === 'fiveYear' ? ' (5-year commitment)' : ''}!
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                            STEP 5 — Payment
                        ══════════════════════════════════════════════════════ */}
                        {step === 5 && (
                            <div className="p-6 sm:p-8 space-y-6">
                                <SectionHeading
                                    icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                                    title="Payment"
                                />

                                {trialAlreadyAvailed && (
                                    <div className="rounded-2xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                                        Free trial already availed for this email. Registration can continue as a paid subscription after admin verification.
                                    </div>
                                )}

                                {/* Order Summary */}
                                {(() => {
                                    const plan = getSelectedPlanData()
                                    const basePrice = getBasePrice()
                                    const gst = getGstAmount()
                                    const planTotal = getPlanTotal()
                                    const discountedPlanTotal = getDiscountedPlanTotal()
                                    const platformCharges = getRazorpayCommission(discountedPlanTotal)
                                    const grandTotal = getGrandTotal()
                                    const cycleName = BILLING_CYCLES.find(b => b.key === normalizedBillingCycle)?.label

                                    return (
                                        <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-900/20 border border-brand-200 dark:border-brand-700 rounded-2xl p-5 space-y-4">
                                            <h4 className="text-sm font-semibold text-brand-800 dark:text-brand-300 uppercase tracking-wide">Order Summary</h4>

                                            <div className="space-y-3">
                                                {/* Plan info */}
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{plan?.name} Plan</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">{cycleName} billing</p>
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">₹{basePrice.toLocaleString('en-IN')}</span>
                                                </div>

                                                {/* GST */}
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">GST (18%)</p>
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">₹{gst.toLocaleString('en-IN')}</span>
                                                </div>

                                                {/* Plan subtotal */}
                                                <div className="border-t border-brand-200 dark:border-brand-700 pt-3 flex items-center justify-between">
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Plan Price {isFiveYear ? '(GST inclusive)' : ''}</p>
                                                    <span className="text-sm font-bold text-gray-900 dark:text-white">₹{planTotal.toLocaleString('en-IN')}</span>
                                                </div>

                                                {couponDiscount > 0 && (
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm text-emerald-600 dark:text-emerald-400">Coupon Discount</p>
                                                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">-₹{couponDiscount.toLocaleString('en-IN')}</span>
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
                                                <div className="border-t-2 border-brand-300 dark:border-brand-600 pt-3 flex items-center justify-between">
                                                    <p className="text-base font-bold text-gray-900 dark:text-white">Total Payable</p>
                                                    <span className="text-xl font-extrabold text-brand-600 dark:text-brand-400">₹{grandTotal.toLocaleString('en-IN')}</span>
                                                </div>
                                            </div>

                                            {/* Annual maintenance note for 5-year plan */}
                                            {isFiveYear && (
                                                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
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
                                            value={couponCode}
                                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                            placeholder="Enter coupon code"
                                            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleApplyCoupon}
                                            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                    {couponStatus && <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">{couponStatus}</p>}
                                </div>

                                {/* Payment Options */}
                                {!paymentMethod && (
                                    <div className="space-y-3">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Choose Payment Method</p>

                                        {/* Pay Online - Razorpay */}
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
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Instant activation via Razorpay (UPI, Card, Net Banking)</p>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-400 group-hover:text-brand transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>

                                        {/* Pay Directly to Owner */}
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

                                {/* Owner Payment Verification Section */}
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
                                                        After submitting your registration, a verification email will be sent to the super admin. 
                                                        Once payment is confirmed and approved, your clinic will be activated automatically.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-3">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">How it works:</h4>
                                            <ol className="space-y-2.5">
                                                {[
                                                    'Submit your clinic registration',
                                                    'Super admin receives a verification email',
                                                    'Make payment directly to the clinic owner',
                                                    'Super admin verifies & approves your clinic',
                                                    'Your clinic is activated instantly'
                                                ].map((s, i) => (
                                                    <li key={i} className="flex items-start gap-3">
                                                        <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
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
                                                onClick={handleConfirmOwnerPayment}
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


                        {/* ── Footer navigation ── */}
                        <div className="bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 px-6 sm:px-8 py-5 flex items-center gap-3">
                            {step > 0 && (
                                <button type="button" onClick={goBack}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back
                                </button>
                            )}

                            {step < 5 ? (
                                <button type="button" onClick={goNext}
                                    className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white text-sm font-semibold rounded-xl transition-all shadow shadow-brand/30">
                                    Continue
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            ) : null}
                        </div>
                    </form>

                    {/* ── Links ── */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6 text-sm text-gray-500">
                        <button onClick={() => router.push('/clinic-login')} className="text-brand-600 hover:text-brand-700 font-medium transition-colors">
                            Already have an access code? Login →
                        </button>
                        <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
                        <button onClick={() => router.push('/')} className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Home
                        </button>
                    </div>
                </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-lg">{children}</div>
        </div>
    )
}

function StatusCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-12 text-center">{children}</div>
    )
}

function Spinner({ color }: { color: 'blue' | 'green' }) {
    const cls = color === 'blue'
        ? 'border-brand-200 dark:border-brand-800 border-t-brand-600 dark:border-t-brand-400'
        : 'border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400'
    return <div className={`w-16 h-16 mx-auto rounded-full border-4 ${cls} animate-spin`} />
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

function SectionHeading({ icon, title, optional }: { icon: React.ReactNode; title: string; optional?: boolean }) {
    return (
        <div className="flex items-center gap-2.5 mb-1">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                {icon}
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {title}
                {optional && <span className="ml-2 text-xs font-normal text-gray-400">(optional)</span>}
            </h3>
        </div>
    )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
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

function PasswordStrength({ password }: { password: string }) {
    const checks = [
        { label: '8+ characters',      pass: password.length >= 8 },
        { label: 'Uppercase letter',   pass: /[A-Z]/.test(password) },
        { label: 'Number',             pass: /[0-9]/.test(password) },
        { label: 'Special character',  pass: /[^A-Za-z0-9]/.test(password) },
    ]
    const score = checks.filter(c => c.pass).length
    const barColor = ['bg-red-400', 'bg-red-400', 'bg-amber-400', 'bg-brand', 'bg-green-500'][score]
    const labelText = ['', 'Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][score]
    const textColor = ['text-red-400', 'text-red-400', 'text-amber-500', 'text-brand', 'text-green-500'][score]

    return (
        <div className="space-y-2 -mt-1">
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${(score / 4) * 100}%` }} />
                </div>
                <span className={`text-xs font-semibold ${textColor} w-20 text-right`}>{labelText}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {checks.map(c => (
                    <p key={c.label} className={`flex items-center gap-1.5 text-xs ${c.pass ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            {c.pass
                                ? <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                : <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 002 0V7zm-1 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            }
                        </svg>
                        {c.label}
                    </p>
                ))}
            </div>
        </div>
    )
}
