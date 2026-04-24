import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import prisma from '../../../lib/prisma'
import { isFeatureAllowed } from '../../../lib/subscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Verify authentication
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    // Check if user is admin
    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed((authUser as any).clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({
            error: 'Admin Settings is available in Standard plan.',
            code: 'FEATURE_RESTRICTED',
            upgradeUrl: '/upgrade',
        })
    }

    if (req.method === 'GET') {
        try {
            const clinicId = getClinicIdFromUser(authUser)
            
            const users = await prisma.user.findMany({
                where: { clinicId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    profileImage: true,
                    createdAt: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            })

            return res.status(200).json({ users })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch users' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
