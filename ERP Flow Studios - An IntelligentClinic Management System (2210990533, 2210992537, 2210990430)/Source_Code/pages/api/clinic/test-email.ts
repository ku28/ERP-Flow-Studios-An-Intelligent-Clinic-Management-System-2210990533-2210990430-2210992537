import type { NextApiRequest, NextApiResponse } from 'next'
import nodemailer from 'nodemailer'
import { verifySessionToken } from '../../../lib/auth'
import prisma from '../../../lib/prisma'
import { refreshGmailToken } from '../../../lib/gmailAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { clinic: true } })
        if (!user || user.role !== 'admin' || !user.clinic) {
            return res.status(403).json({ error: 'Only clinic admins can test email settings.' })
        }

        const clinic = user.clinic as any
        const provider = clinic.emailProvider || 'system'
        let transporter: nodemailer.Transporter
        let fromAddress = ''
        let recipient = ''
        let providerLabel = 'System SMTP'

        if (provider === 'gmail') {
            if (!clinic.gmailRefreshToken) {
                return res.status(400).json({ error: 'Gmail is selected but not connected. Please connect Gmail first.' })
            }

            const tokens = await refreshGmailToken(clinic.gmailRefreshToken)
            await prisma.clinic.update({
                where: { id: clinic.id },
                data: {
                    gmailAccessToken: tokens.access_token,
                    gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                },
            })

            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: clinic.gmailEmail || clinic.email,
                    clientId: process.env.GOOGLE_GMAIL_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_GMAIL_CLIENT_SECRET,
                    refreshToken: clinic.gmailRefreshToken,
                    accessToken: tokens.access_token,
                },
            } as any)

            recipient = clinic.gmailEmail || clinic.email
            fromAddress = clinic.name ? `${clinic.name} <${recipient}>` : recipient
            providerLabel = 'Gmail OAuth'
        } else if (provider === 'smtp') {
            if (!clinic.smtpHost || !clinic.smtpEmail || !clinic.smtpPassword) {
                return res.status(400).json({ error: 'SMTP provider is selected but SMTP settings are incomplete.' })
            }

            transporter = nodemailer.createTransport({
                host: clinic.smtpHost,
                port: parseInt(String(clinic.smtpPort || 587), 10) || 587,
                secure: Boolean(clinic.smtpSecure),
                auth: { user: clinic.smtpEmail, pass: clinic.smtpPassword },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
            })

            recipient = clinic.smtpEmail
            fromAddress = clinic.name ? `${clinic.name} <${clinic.smtpEmail}>` : clinic.smtpEmail
            providerLabel = 'Custom SMTP'
        } else {
            if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
                return res.status(400).json({ error: 'System SMTP is not configured on server.' })
            }

            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: false,
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
            })

            recipient = clinic.email || process.env.SMTP_USER
            fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || ''
            providerLabel = 'System SMTP'
        }

        await transporter.verify()

        await transporter.sendMail({
            from: fromAddress,
            to: recipient,
            subject: 'ERP Flow Studios - Email Test',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #7c3aed;">✅ Email Test Successful!</h2>
                <p>This test email confirms that your email integration is working correctly.</p>
                <p><strong>Clinic:</strong> ${clinic.name}</p>
                <p><strong>Provider:</strong> ${providerLabel}</p>
                <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">This is an automated test from ERP Flow Studios.</p>
            </div>`,
        })

        return res.status(200).json({ message: `Test email sent successfully via ${providerLabel}! Check your inbox.` })
    } catch (error: any) {
        const msg = error.message || 'Connection failed'
        return res.status(400).json({ error: `Email test failed: ${msg}` })
    }
}
