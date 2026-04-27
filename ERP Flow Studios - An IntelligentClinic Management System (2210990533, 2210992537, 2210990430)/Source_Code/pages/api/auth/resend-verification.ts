import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import crypto from 'crypto'
import { sendEmail, generateVerificationEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { email } = req.body
    if (!email) {
        return res.status(400).json({ error: 'Email is required' })
    }

    try {
        const pendingUser = await prisma.pendingUser.findUnique({
            where: { email }
        })

        if (!pendingUser) {
            return res.status(404).json({ error: 'No pending registration found for this email' })
        }

        // Generate new verification token and expiration
        const verificationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 24)

        await prisma.pendingUser.update({
            where: { email },
            data: { verificationToken, expiresAt }
        })

        // Get super admin emails
        const superAdmins = await prisma.user.findMany({
            where: { role: 'super_admin' },
            select: { email: true }
        })

        // Get clinic admin emails if clinicId is provided
        let clinicAdmins: any[] = []
        if (pendingUser.clinicId) {
            clinicAdmins = await prisma.user.findMany({
                where: { role: 'admin', clinicId: pendingUser.clinicId },
                select: { email: true }
            })
        }

        const allAdminEmails = [
            ...superAdmins.map((a: any) => a.email).filter(Boolean),
            ...clinicAdmins.map((a: any) => a.email).filter(Boolean)
        ]

        if (allAdminEmails.length === 0 && process.env.SMTP_USER) {
            allAdminEmails.push(process.env.SMTP_USER)
        }

        const emailHtml = generateVerificationEmail(
            pendingUser.name || 'Unknown',
            pendingUser.email,
            pendingUser.role,
            verificationToken
        )

        const emailPromises = allAdminEmails.map(adminEmail =>
            sendEmail({
                to: adminEmail,
                subject: `🔔 [Resend] User Registration: ${pendingUser.name} (${pendingUser.role})`,
                html: emailHtml
            })
        )

        await Promise.all(emailPromises)

        return res.status(200).json({ message: 'Verification email resent to admins.' })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
