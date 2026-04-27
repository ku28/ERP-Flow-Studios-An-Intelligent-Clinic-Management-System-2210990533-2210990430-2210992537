import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { clinic: true } })
        if (!user || user.role !== 'admin' || !user.clinic) {
            return res.status(403).json({ error: 'Only clinic admins can disconnect Gmail.' })
        }

        await prisma.clinic.update({
            where: { id: user.clinic.id },
            data: {
                emailProvider: 'system',
                gmailAccessToken: null,
                gmailRefreshToken: null,
                gmailEmail: null,
                gmailTokenExpiry: null,
            },
        })

        return res.status(200).json({ message: 'Gmail disconnected successfully' })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to disconnect Gmail' })
    }
}
