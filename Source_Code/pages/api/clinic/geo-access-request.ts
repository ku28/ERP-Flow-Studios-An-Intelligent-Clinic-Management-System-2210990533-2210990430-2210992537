/**
 * POST /api/clinic/geo-access-request
 * Creates a geo access bypass request and sends approval emails.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { sendEmail, generateGeoAccessRequestEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { clinicId, receptionistEmail, receptionistName } = req.body

    if (!clinicId || !receptionistEmail) {
        return res.status(400).json({ error: 'clinicId and receptionistEmail are required' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(receptionistEmail)) {
        return res.status(400).json({ error: 'Invalid email address' })
    }

    try {
        const clinic = await prisma.clinic.findUnique({
            where: { clinicId },
            select: {
                id: true,
                name: true,
                email: true,
                users: {
                    where: { role: 'admin' },
                    select: { email: true, name: true }
                }
            }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }

        // Check if there's already a pending request from this email for this clinic (within last 10 min)
        const existingRequest = await prisma.geoAccessRequest.findFirst({
            where: {
                clinicId: clinic.id,
                receptionistEmail,
                status: 'pending',
                requestedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }
            }
        })

        let request
        if (existingRequest) {
            request = existingRequest
        } else {
            request = await prisma.geoAccessRequest.create({
                data: {
                    clinicId: clinic.id,
                    receptionistEmail,
                    receptionistName: receptionistName || null,
                    status: 'pending'
                }
            })
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const approvalUrl = `${appUrl}/geo-access-approve?token=${request.approvalToken}&action=approve`
        const denyUrl = `${appUrl}/geo-access-approve?token=${request.approvalToken}&action=deny`

        const emailHtml = generateGeoAccessRequestEmail(
            receptionistName || 'Staff Member',
            receptionistEmail,
            clinic.name,
            approvalUrl,
            denyUrl
        )

        // Send to all clinic admins
        const recipients: string[] = clinic.users
            .filter((u: { email: string | null }) => u.email)
            .map((u: { email: string | null }) => u.email as string)

        // Also send to super admin email if configured
        if (process.env.SUPER_ADMIN_EMAIL) {
            recipients.push(process.env.SUPER_ADMIN_EMAIL)
        }

        // Also send to the clinic's registered email (in case admins differ)
        if (clinic.email && !recipients.includes(clinic.email)) {
            recipients.push(clinic.email)
        }

        const uniqueRecipients = [...new Set(recipients)]

        for (const to of uniqueRecipients) {
            await sendEmail({
                to,
                subject: `🔐 Location Access Request — ${clinic.name} ERP`,
                html: emailHtml
            }).catch(() => { /* don't fail if one email fails */ })
        }

        return res.status(200).json({
            success: true,
            requestId: request.id,
            message: 'Request sent to clinic admin for approval'
        })
    } catch (error) {
        console.error('Geo access request error:', error)
        return res.status(500).json({ error: 'Failed to create access request' })
    }
}
