import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import prisma from '../../../lib/prisma'

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

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'DELETE') {
        try {
            const { userId } = req.body
            const targetUserId = Number(userId)

            if (!targetUserId) {
                return res.status(400).json({ error: 'User ID is required' })
            }

            // Prevent deleting own account
            if (targetUserId === authUser.id) {
                return res.status(400).json({ error: 'You cannot delete your own account' })
            }

            const clinicId = getClinicIdFromUser(authUser)
            const user = await prisma.user.findFirst({
                where: { id: targetUserId, clinicId },
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            })

            if (!user) {
                return res.status(404).json({ error: 'User not found' })
            }

            // Delete user
            await prisma.user.delete({
                where: { id: targetUserId }
            })

            return res.status(200).json({ 
                message: `User ${user.name} (${user.email}) deleted successfully`,
                user 
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete user' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
