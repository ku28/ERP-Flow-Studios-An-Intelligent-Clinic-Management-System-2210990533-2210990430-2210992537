import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import { SUBSCRIPTION_PLANS } from './plans'
import { isBillingCycleLocked } from '../../../lib/subscriptionBilling'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || ''
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''

function razorpayHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64'),
    }
}

// Map billing cycle to Razorpay period & interval
function cycleToRazorpay(cycle: string) {
    switch (cycle) {
        case 'monthly':   return { period: 'monthly', interval: 1 }
        case 'quarterly': return { period: 'monthly', interval: 3 }
        case 'annual':    return { period: 'yearly',  interval: 1 }
        default:          return null // fiveYear = one-time payment, not a recurring subscription
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub },
            include: { clinic: true },
        })

        if (!user || !user.clinic) {
            return res.status(403).json({ error: 'No clinic found' })
        }

        const { plan, cycle } = req.body
        if (!plan || !cycle) {
            return res.status(400).json({ error: 'Plan and cycle are required' })
        }

        if (isBillingCycleLocked(cycle)) {
            return res.status(400).json({ error: 'Monthly and 3-month plans are shown for reference. A minimum 1-year subscription is required.' })
        }

        const planData = SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS]
        if (!planData) return res.status(400).json({ error: 'Invalid plan' })

        const priceInPaise = planData.prices[cycle as keyof typeof planData.prices]
        if (!priceInPaise) return res.status(400).json({ error: 'Invalid billing cycle' })

        const clinic = user.clinic!

        // 5-year = one-time order (not recurring subscription)
        if (cycle === 'fiveYear') {
            const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: razorpayHeaders(),
                body: JSON.stringify({
                    amount: priceInPaise,
                    currency: 'INR',
                    receipt: `fiveYear_${clinic.id}_${Date.now()}`,
                    notes: {
                        clinicId: clinic.id,
                        plan,
                        cycle: 'fiveYear',
                    },
                }),
            })

            if (!orderRes.ok) {
                const err = await orderRes.json()
                console.error('Razorpay order error:', err)
                return res.status(500).json({ error: 'Failed to create payment order' })
            }

            const order = await orderRes.json()
            return res.status(200).json({
                type: 'order',
                orderId: order.id,
                amount: priceInPaise,
                currency: 'INR',
                keyId: RAZORPAY_KEY_ID,
                clinicName: clinic.name,
                clinicEmail: clinic.email,
            })
        }

        // Recurring subscription
        const razorpayCycle = cycleToRazorpay(cycle)!

        // 1) Create or reuse Razorpay customer
        let customerId = clinic.razorpayCustomerId
        if (!customerId) {
            const custRes = await fetch('https://api.razorpay.com/v1/customers', {
                method: 'POST',
                headers: razorpayHeaders(),
                body: JSON.stringify({
                    name: clinic.name,
                    email: clinic.email,
                    notes: { clinicId: clinic.id },
                }),
            })
            if (!custRes.ok) {
                return res.status(500).json({ error: 'Failed to create customer' })
            }
            const cust = await custRes.json()
            customerId = cust.id
            await prisma.clinic.update({
                where: { id: clinic.id },
                data: { razorpayCustomerId: customerId },
            })
        }

        // 2) Create a Razorpay Plan (idempotent per plan+cycle combo)
        const planRes = await fetch('https://api.razorpay.com/v1/plans', {
            method: 'POST',
            headers: razorpayHeaders(),
            body: JSON.stringify({
                period: razorpayCycle.period,
                interval: razorpayCycle.interval,
                item: {
                    name: `${planData.name} - ${cycle}`,
                    amount: priceInPaise,
                    currency: 'INR',
                    description: planData.description,
                },
                notes: { plan, cycle },
            }),
        })

        if (!planRes.ok) {
            const err = await planRes.json()
            console.error('Razorpay plan error:', err)
            return res.status(500).json({ error: 'Failed to create subscription plan' })
        }

        const razorpayPlan = await planRes.json()

        // 3) Create Razorpay subscription
        const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
            method: 'POST',
            headers: razorpayHeaders(),
            body: JSON.stringify({
                plan_id: razorpayPlan.id,
                customer_id: customerId,
                total_count: cycle === 'annual' ? 10 : 36, // max billing cycles
                notes: {
                    clinicId: clinic.id,
                    plan,
                    cycle,
                },
            }),
        })

        if (!subRes.ok) {
            const err = await subRes.json()
            console.error('Razorpay subscription error:', err)
            return res.status(500).json({ error: 'Failed to create subscription' })
        }

        const subscription = await subRes.json()

        // Save razorpay subscription ID
        await prisma.clinic.update({
            where: { id: clinic.id },
            data: { razorpaySubscriptionId: subscription.id },
        })

        return res.status(200).json({
            type: 'subscription',
            subscriptionId: subscription.id,
            keyId: RAZORPAY_KEY_ID,
            clinicName: clinic.name,
            clinicEmail: clinic.email,
        })

    } catch (error: any) {
        console.error('Subscription create error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
