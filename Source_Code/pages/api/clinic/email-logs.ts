import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { clinic: true } })
        if (!user || !user.clinic) {
            return res.status(403).json({ error: 'Access denied' })
        }

        const page = parseInt(req.query.page as string) || 1
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
        const skip = (page - 1) * limit

        const [logs, total] = await Promise.all([
            prisma.emailLog.findMany({
                where: { clinicId: user.clinic.id },
                orderBy: { sentAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.emailLog.count({ where: { clinicId: user.clinic.id } }),
        ])

        return res.status(200).json({ logs, total, page, limit })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to fetch email logs' })
    }
}
