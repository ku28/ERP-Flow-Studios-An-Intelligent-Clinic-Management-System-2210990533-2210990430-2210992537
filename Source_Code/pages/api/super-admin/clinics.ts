import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify user is super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        // Fetch all clinics with user count
        const clinics = await prisma.clinic.findMany({
            include: {
                _count: {
                    select: { users: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return res.status(200).json({ clinics })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to fetch clinics' })
    }
}
