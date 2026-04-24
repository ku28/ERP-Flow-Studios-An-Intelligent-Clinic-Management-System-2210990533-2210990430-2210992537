import type { NextApiRequest, NextApiResponse } from 'next'
import { MIN_SUBSCRIPTION_MONTHS } from '../../../lib/subscriptionBilling'

// Plan pricing in INR (paise for Razorpay)
export const SUBSCRIPTION_PLANS = {
    basic: {
        name: 'Basic',
        description: 'Starter plan for single-practitioner setup',
        prices: {
            monthly: 49900,      // ₹499
            quarterly: 119900,   // ₹1,199
            annual: 399900,      // ₹3,999
            fiveYear: 1999900,   // ₹19,999 (GST inclusive)
        },
        features: [
            'Patient Management',
            'Smart Prescriptions',
            'Pharmacy & Inventory',
            'Invoice & Billing',
            '14 Days Free Trial',
            'Max 3 users total (1 Admin, 1 Doctor, 1 Staff)',
            '6-hour login token expiry',
            'No Export access',
            'No Admin Settings access',
            'No Upload Bill',
            'No Aadhaar Scanning',
        ],
    },
    standard: {
        name: 'Standard',
        description: 'All core features for growing clinics',
        prices: {
            monthly: 99900,      // ₹999
            quarterly: 269900,   // ₹2,699
            annual: 799900,      // ₹7,999
            fiveYear: 2999900,   // ₹29,999
        },
        features: [
            'All Basic Features +',
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
    pro: {
        name: 'Pro',
        description: 'Advanced tools with AI-powered workflows',
        prices: {
            monthly: 249900,     // ₹2,499
            quarterly: 699900,   // ₹6,999
            annual: 1999900,     // ₹19,999
            fiveYear: 7499900,   // ₹74,999
        },
        features: [
            'All Basic Features',
            'Customized Themes',
            'OCR with Enhanced AI APIs',
            'AI-powered Diagnostics',
            'Advanced AI Integrations',
            'Priority Support',
        ],
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    return res.status(200).json({ plans: SUBSCRIPTION_PLANS, minimumSubscriptionMonths: MIN_SUBSCRIPTION_MONTHS })
}
