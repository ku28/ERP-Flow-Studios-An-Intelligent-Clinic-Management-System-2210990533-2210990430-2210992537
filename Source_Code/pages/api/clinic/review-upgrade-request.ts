import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth'
import { sendEmail } from '../../../lib/email'
import { getUpgradeRequestByToken, updateUpgradeRequestStatus } from '../../../lib/upgradeRequests'

function getSubscriptionEndDate(cycle: 'annual' | 'fiveYear') {
    const end = new Date()
    if (cycle === 'fiveYear') {
        end.setFullYear(end.getFullYear() + 5)
    } else {
        end.setFullYear(end.getFullYear() + 1)
    }
    return end
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const token = typeof (req.method === 'GET' ? req.query.token : req.body?.token) === 'string'
        ? (req.method === 'GET' ? req.query.token : req.body?.token)
        : ''

    if (!token) {
        return res.status(400).json({ error: 'token is required' })
    }

    const request = await getUpgradeRequestByToken(token)
    if (!request) {
        return res.status(404).json({ error: 'Request not found' })
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            request: {
                clinicName: request.clinicName,
                clinicCode: request.clinicCode,
                adminEmail: request.adminEmail,
                adminName: request.adminName || null,
                requestedPlan: request.requestedPlan,
                requestedCycle: request.requestedCycle,
                paymentMethod: request.paymentMethod,
                amount: request.amount,
                couponCode: request.couponCode || null,
                razorpayPaymentId: request.razorpayPaymentId || null,
                status: request.status,
                createdAt: request.createdAt,
                decidedAt: request.decidedAt || null,
                decidedBy: request.decidedBy || null,
                notes: request.notes || null,
            },
        })
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const action = req.body?.action === 'approve' || req.body?.action === 'decline' ? req.body.action : ''
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null

    if (!action) {
        return res.status(400).json({ error: 'Invalid action' })
    }

    if (request.status !== 'pending') {
        return res.status(400).json({ error: `Request already ${request.status}` })
    }

    const authUser = await getSessionUser(req).catch(() => null)
    const decidedBy = authUser?.email || 'Super Admin'

    if (action === 'approve') {
        const clinic = await prisma.clinic.findUnique({
            where: { id: request.clinicId },
            select: { id: true, name: true, clinicId: true, email: true },
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }

        const now = new Date()
        await prisma.clinic.update({
            where: { id: request.clinicId },
            data: {
                status: 'active',
                subscriptionPlan: request.requestedPlan,
                subscriptionCycle: request.requestedCycle,
                subscriptionStatus: 'active',
                subscriptionStart: now,
                subscriptionEnd: getSubscriptionEndDate(request.requestedCycle),
                trialEndsAt: null,
            },
        })

        await updateUpgradeRequestStatus(token, 'approved', decidedBy, notes)

        try {
            await sendEmail({
                to: request.adminEmail || clinic.email,
                subject: `Upgrade Approved: ${clinic.name}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                        <h2 style="margin-bottom:8px; color:#16a34a;">Upgrade Approved</h2>
                        <p>Your upgrade request for <strong>${request.requestedPlan.toUpperCase()}</strong> (${request.requestedCycle}) has been approved.</p>
                        <p>You can log in and continue using your clinic with upgraded features.</p>
                    </div>
                `,
            })
        } catch {}

        return res.status(200).json({ success: true, status: 'approved' })
    }

    await updateUpgradeRequestStatus(token, 'rejected', decidedBy, notes)

    try {
        await sendEmail({
            to: request.adminEmail,
            subject: `Upgrade Request Declined: ${request.clinicName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                    <h2 style="margin-bottom:8px; color:#dc2626;">Upgrade Request Declined</h2>
                    <p>Your upgrade request for <strong>${request.requestedPlan.toUpperCase()}</strong> (${request.requestedCycle}) was declined.</p>
                    <p>Please contact support or submit a new request.</p>
                </div>
            `,
        })
    } catch {}

    return res.status(200).json({ success: true, status: 'rejected' })
}
