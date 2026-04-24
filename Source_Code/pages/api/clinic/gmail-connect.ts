import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import { getGmailAuthUrl } from '../../../lib/gmailAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { clinic: true } })
        if (!user || user.role !== 'admin' || !user.clinic) {
            return res.status(403).json({ error: 'Only clinic admins can connect Gmail.' })
        }

        if (!process.env.GOOGLE_GMAIL_CLIENT_ID || !process.env.GOOGLE_GMAIL_CLIENT_SECRET) {
            return res.status(400).json({ error: 'Gmail OAuth is not configured. Set GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET in environment.' })
        }

        const authUrl = getGmailAuthUrl(user.clinic.id)
        // Keep both keys for backward compatibility with existing clients.
        return res.status(200).json({ authUrl, url: authUrl })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to generate Gmail auth URL' })
    }
}
