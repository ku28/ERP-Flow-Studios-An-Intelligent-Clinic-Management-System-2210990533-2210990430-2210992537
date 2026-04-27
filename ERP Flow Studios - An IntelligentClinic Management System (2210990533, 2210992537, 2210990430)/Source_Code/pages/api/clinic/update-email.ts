import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { clinic: true } })
        if (!user || user.role !== 'admin' || !user.clinic) {
            return res.status(403).json({ error: 'Only clinic admins can change email settings.' })
        }

        const { emailProvider, smtpHost, smtpPort, smtpEmail, smtpPassword, smtpSecure } = req.body

        if (!['system', 'smtp', 'gmail'].includes(emailProvider)) {
            return res.status(400).json({ error: 'Invalid email provider' })
        }

        const updateData: any = { emailProvider }

        if (emailProvider === 'smtp') {
            if (!smtpHost || !smtpEmail || !smtpPassword) {
                return res.status(400).json({ error: 'SMTP Host, Email, and Password are required' })
            }
            updateData.smtpHost = smtpHost
            updateData.smtpPort = parseInt(smtpPort) || 587
            updateData.smtpEmail = smtpEmail
            updateData.smtpPassword = smtpPassword
            updateData.smtpSecure = smtpSecure === true
        }

        if (emailProvider === 'system') {
            // Clear custom SMTP when switching back to system
            updateData.smtpHost = null
            updateData.smtpPort = null
            updateData.smtpEmail = null
            updateData.smtpPassword = null
            updateData.smtpSecure = false
        }

        await prisma.clinic.update({ where: { id: user.clinic.id }, data: updateData })

        return res.status(200).json({ message: 'Email settings saved successfully' })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to save email settings' })
    }
}
