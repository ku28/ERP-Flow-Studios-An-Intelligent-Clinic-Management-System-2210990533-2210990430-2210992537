import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)
    if (!authUser) return res.status(401).json({ error: 'Not authenticated' })
    if (authUser.role !== 'admin') return res.status(403).json({ error: 'Access denied. Admin role required.' })

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'POST') {
        try {
            const { userId } = req.body
            const targetUserId = Number(userId)

            if (!targetUserId) return res.status(400).json({ error: 'User ID is required' })
            if (targetUserId === authUser.id) return res.status(400).json({ error: 'You cannot expire your own session' })

            const clinicId = getClinicIdFromUser(authUser)
            const user = await prisma.user.findFirst({
                where: { id: targetUserId, clinicId },
                select: { id: true, name: true, email: true },
            })
            if (!user) return res.status(404).json({ error: 'User not found' })

            const result = await prisma.sessionRecord.updateMany({
                where: { userId: targetUserId, clinicId, isActive: true },
                data: { isActive: false },
            })

            return res.status(200).json({
                message: `User session expired. ${result.count} session(s) invalidated. User will need to log in again.`,
                user,
                sessionsInvalidated: result.count,
            })
        } catch {
            return res.status(500).json({ error: 'Failed to expire session' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
