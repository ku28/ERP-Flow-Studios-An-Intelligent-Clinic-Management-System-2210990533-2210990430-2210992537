"use client";

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { isBillingCycleLocked, MINIMUM_SUBSCRIPTION_TOOLTIP } from '../../lib/subscriptionBilling'

const BILLING_CYCLES = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Every 3 Months' },
    { key: 'annual', label: 'Annual' },
    { key: 'fiveYear', label: '5-Year Plan' },
]

// For monthly/quarterly/annual: prices are base prices, 18% GST is added on top.
// For fiveYear: prices are GST-inclusive (base + 18% GST = displayed price).
const PLANS = [
    {
        name: 'Basic',
        description: 'Starter plan for a compact clinic team.',
        prices: {
            monthly: 499,
            quarterly: 1199,
            annual: 3999,
            fiveYear: 19999,
        },
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
        highlighted: false,
        cta: 'Start Free Trial',
    },
    {
        name: 'Standard',
        description: 'Full core feature set for growing clinics.',
        prices: {
            monthly: 999,
            quarterly: 2699,
            annual: 7999,
            fiveYear: 29999,
        },
        features: [
            'Everything in Basic +',
            'Analytics & Reports',
            'Export Access',
            'Admin Settings',
            'Upload Bill',
            'Aadhaar Scanning',
            'Geo-restricted Login',
            'Treatment Templates',
            'Patient Import / Export',
        ],
        highlighted: true,
        cta: 'Get Started',
    },
    {
        name: 'Pro',
        description: 'Advanced tools for growing clinics with AI-powered workflows.',
        prices: {
            monthly: 2499,
            quarterly: 6999,
            annual: 19999,
            fiveYear: 74999,
        },
        features: [
            'Everything in Basic +',
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
        highlighted: true,
        cta: 'Get Started',
    },
]

export default function Pricing() {
    const [cycle, setCycle] = useState<string>('annual')
    const [showMinimumPlanNotice, setShowMinimumPlanNotice] = useState(false)
    const router = useRouter()

    const handleCycleSelection = (nextCycle: string) => {
        setCycle(nextCycle)
        if (isBillingCycleLocked(nextCycle)) {
            setShowMinimumPlanNotice(true)
        }
    }

    return (
        <section id="pricing" className="py-24 bg-gray-50 dark:bg-[#0f0f0f]" aria-labelledby="pricing-heading">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
                {/* Header */}
                <div className="text-center mb-12 px-4">
                    <p className="text-brand font-semibold tracking-wider uppercase text-sm mb-3">Pricing</p>
                    <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                        Simple, Transparent Plans
                    </h2>
                    <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                        Choose the plan that fits your clinic. No hidden fees, cancel anytime.
                    </p>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        Need help deciding? Continue to{' '}
                        <Link href="/contact" className="font-semibold text-brand hover:underline">contact</Link>
                        {' '}for onboarding and billing support.
                    </p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="flex justify-center mb-12">
                    <div className="inline-flex bg-white dark:bg-gray-900 rounded-full p-1 border border-gray-200 dark:border-gray-700 shadow-sm">
                        {BILLING_CYCLES.map(bc => {
                            const isLocked = isBillingCycleLocked(bc.key)
                            return (
                            <button
                                key={bc.key}
                                onClick={() => handleCycleSelection(bc.key)}
                                title={isLocked ? MINIMUM_SUBSCRIPTION_TOOLTIP : undefined}
                                aria-label={isLocked ? `${bc.label} requires 1 year plan` : bc.label}
                                className={`px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${
                                    cycle === bc.key
                                        ? 'bg-brand text-white shadow-md'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    {isLocked && <span className="text-xs" aria-hidden="true">🔒</span>}
                                    <span>{bc.label}</span>
                                    {isLocked && (
                                        <span className="hidden sm:inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                            Requires 1 Year Plan
                                        </span>
                                    )}
                                </span>
                            </button>
                            )
                        })}
                    </div>
                </div>

                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-8" role="note">
                    {MINIMUM_SUBSCRIPTION_TOOLTIP}
                </p>

                {/* Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {PLANS.map((plan, idx) => {
                        const price = plan.prices[cycle as keyof typeof plan.prices]
                        const isFiveYear = cycle === 'fiveYear'

                        return (
                            <article
                                key={idx}
                                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                                    plan.highlighted
                                        ? 'border-brand bg-gradient-to-b from-brand/5 to-white dark:from-brand/10 dark:to-gray-900 shadow-lg shadow-brand/10'
                                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                                }`}
                                itemScope
                                itemType="https://schema.org/Offer"
                            >
                                {plan.highlighted && (
                                    <div className="absolute top-0 left-0 right-0 bg-brand text-white text-center text-xs font-semibold py-1.5 tracking-wide">
                                        MOST POPULAR
                                    </div>
                                )}

                                <div className={`p-6 sm:p-8 ${plan.highlighted ? 'pt-10' : ''}`}>
                                    {/* Plan Name */}
                                    <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-1" itemProp="name">{plan.name}</h4>
                                    <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                        Trial Available
                                    </div>
                                    {plan.name === 'Basic' && (
                                        <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                            14 Days Free Trial
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6" itemProp="description">{plan.description}</p>

                                    {/* Price */}
                                    <div className="flex items-baseline gap-1 mb-2">
                                        <span className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white" itemProp="price">₹{price.toLocaleString('en-IN')}</span>
                                        {!isFiveYear && <span className="text-gray-500 dark:text-gray-400 text-sm">/{cycle === 'monthly' ? 'mo' : cycle === 'quarterly' ? '3 mo' : 'yr'}</span>}
                                        {isFiveYear && <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">one-time</span>}
                                    </div>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                                        {isFiveYear ? 'GST inclusive · ' : '+ 18% GST · '}
                                        {isFiveYear ? 'Platform charges extra' : 'Platform charges extra'}
                                    </p>
                                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-6 -mt-4">
                                        Minimum subscription: 1 Year
                                    </p>
                                    {isFiveYear && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-6 -mt-4">
                                            Annual maintenance: ₹4,999/yr applies during and after the 5-year plan period.
                                        </p>
                                    )}

                                    {/* CTA */}
                                    <button
                                        onClick={() => router.push('/register-clinic')}
                                        aria-label={`Choose ${plan.name} plan`}
                                        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                                            plan.highlighted
                                                ? 'bg-brand text-white hover:bg-brand-600 shadow-md hover:shadow-lg'
                                                : 'bg-brand text-white hover:opacity-90 shadow-md hover:shadow-lg'
                                        }`}
                                    >
                                        {plan.cta}
                                    </button>

                                    {/* Features */}
                                    <ul className="mt-8 space-y-3">
                                        {plan.features.map((f, fi) => (
                                            <li key={fi} className="flex items-start gap-3">
                                                <svg className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </article>
                        )
                    })}
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
                                    setCycle('annual')
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
        </section>
    )
}
