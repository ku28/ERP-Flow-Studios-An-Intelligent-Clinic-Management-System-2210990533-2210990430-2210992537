import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import crypto from 'crypto'

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || ''

function verifyWebhookSignature(body: string, signature: string): boolean {
    if (!RAZORPAY_WEBHOOK_SECRET) return false
    const expected = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex')
    return expected === signature
}

export const config = {
    api: { bodyParser: false },
}

async function getRawBody(req: NextApiRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => (data += chunk))
        req.on('end', () => resolve(data))
        req.on('error', reject)
    })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const rawBody = await getRawBody(req)
        const signature = req.headers['x-razorpay-signature'] as string

        if (RAZORPAY_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
            console.error('Invalid Razorpay webhook signature')
            return res.status(400).json({ error: 'Invalid signature' })
        }

        const event = JSON.parse(rawBody)
        const eventType = event.event

        console.log('Razorpay webhook event:', eventType)

        switch (eventType) {
            case 'subscription.activated':
            case 'subscription.charged': {
                const sub = event.payload?.subscription?.entity
                if (!sub) break

                const clinicId = sub.notes?.clinicId
                const plan = sub.notes?.plan || 'standard'
                const cycle = sub.notes?.cycle || 'monthly'

                if (clinicId) {
                    const now = new Date()
                    let endDate = new Date(now)
                    if (cycle === 'monthly') endDate.setMonth(endDate.getMonth() + 1)
                    else if (cycle === 'quarterly') endDate.setMonth(endDate.getMonth() + 3)
                    else if (cycle === 'annual') endDate.setFullYear(endDate.getFullYear() + 1)

                    await prisma.clinic.update({
                        where: { id: clinicId },
                        data: {
                            subscriptionPlan: plan,
                            subscriptionCycle: cycle,
                            subscriptionStatus: 'active',
                            status: 'active',
                            subscriptionStart: now,
                            subscriptionEnd: endDate,
                            trialEndsAt: null,
                            razorpaySubscriptionId: sub.id,
                        },
                    })
                }
                break
            }

            case 'subscription.cancelled':
            case 'subscription.expired': {
                const sub = event.payload?.subscription?.entity
                if (!sub) break

                const clinicId = sub.notes?.clinicId
                if (clinicId) {
                    await prisma.clinic.update({
                        where: { id: clinicId },
                        data: {
                            subscriptionStatus: eventType === 'subscription.cancelled' ? 'cancelled' : 'expired',
                            status: 'inactive',
                            subscriptionEnd: new Date(),
                        },
                    })
                }
                break
            }

            case 'payment.captured': {
                // Handle one-time 5-year payments
                const payment = event.payload?.payment?.entity
                if (!payment) break

                const clinicId = payment.notes?.clinicId
                const plan = payment.notes?.plan
                const cycle = payment.notes?.cycle

                if (clinicId && cycle === 'fiveYear') {
                    await prisma.clinic.update({
                        where: { id: clinicId },
                        data: {
                            subscriptionPlan: plan || 'standard',
                            subscriptionCycle: 'fiveYear',
                            subscriptionStatus: 'active',
                            status: 'active',
                            subscriptionStart: new Date(),
                            subscriptionEnd: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
                            trialEndsAt: null,
                        },
                    })
                }
                break
            }

            default:
                console.log('Unhandled Razorpay event:', eventType)
        }

        return res.status(200).json({ status: 'ok' })

    } catch (error: any) {
        console.error('Webhook error:', error)
        return res.status(500).json({ error: 'Webhook processing failed' })
    }
}
