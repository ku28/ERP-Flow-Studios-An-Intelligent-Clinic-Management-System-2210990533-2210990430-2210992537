import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth'
import { getDeletionEligibleDate } from '../../../lib/subscriptionLifecycle'
import { sendEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const authUser = await getSessionUser(req)
    if (!authUser || authUser.role !== 'admin' || !authUser.clinicId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const clinic = await prisma.clinic.findUnique({
        where: { id: authUser.clinicId },
        select: {
            id: true,
            clinicId: true,
            name: true,
            email: true,
            status: true,
            subscriptionPlan: true,
            subscriptionStatus: true,
            subscriptionStart: true,
            subscriptionEnd: true,
            trialEndsAt: true,
            createdAt: true,
            updatedAt: true,
        },
    })

    if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' })
    }

    const now = new Date()
    const updatedClinic = await prisma.clinic.update({
        where: { id: clinic.id },
        data: {
            subscriptionStatus: 'cancelled',
            status: 'inactive',
            subscriptionEnd: clinic.subscriptionEnd || now,
        },
        select: {
            id: true,
            clinicId: true,
            name: true,
            status: true,
            subscriptionPlan: true,
            subscriptionStatus: true,
            subscriptionEnd: true,
            trialEndsAt: true,
            createdAt: true,
            updatedAt: true,
        },
    })

    const deletionDate = getDeletionEligibleDate(updatedClinic, now)

    const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin' },
        select: { email: true },
    })
    const recipients = superAdmins.map((u: any) => u.email).filter(Boolean)

    if (recipients.length) {
        await Promise.all(
            recipients.map((email: string) =>
                sendEmail({
                    to: email,
                    subject: `Subscription Cancelled: ${updatedClinic.name}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 20px;">
                            <h2 style="margin-bottom: 8px;">Clinic Subscription Cancelled</h2>
                            <p style="color:#4b5563;">The clinic has cancelled their subscription from Clinic Settings.</p>
                            <div style="background:#f3f4f6; border-radius:12px; padding:16px; margin-top:16px;">
                                <p><strong>Clinic:</strong> ${updatedClinic.name}</p>
                                <p><strong>Clinic Code:</strong> ${updatedClinic.clinicId}</p>
                                <p><strong>Status:</strong> ${updatedClinic.subscriptionStatus}</p>
                                <p><strong>Access Disabled:</strong> Yes (inactive)</p>
                                <p><strong>Scheduled Data Deletion:</strong> ${deletionDate.toLocaleString()}</p>
                            </div>
                        </div>
                    `,
                })
            )
        )
    }

    return res.status(200).json({
        success: true,
        clinic: updatedClinic,
        dataDeletionDate: deletionDate,
        message: 'Subscription cancelled. Clinic access is now disabled. Data will be deleted after 30 days if payment is not restored.',
    })
}
