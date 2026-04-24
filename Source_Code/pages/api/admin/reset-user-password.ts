import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import prisma from '../../../lib/prisma'
import bcrypt from 'bcryptjs'

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

    if (req.method === 'POST') {
        try {
            const { userId } = req.body
            const targetUserId = Number(userId)

            if (!targetUserId) {
                return res.status(400).json({ error: 'User ID is required' })
            }

            // Prevent resetting own password
            if (targetUserId === authUser.id) {
                return res.status(400).json({ error: 'You cannot reset your own password' })
            }

            // Generate temporary password
            const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
            const hashedPassword = await bcrypt.hash(tempPassword, 10)

            const clinicId = getClinicIdFromUser(authUser)
            const targetUser = await prisma.user.findFirst({
                where: { id: targetUserId, clinicId },
                select: { id: true }
            })

            if (!targetUser) {
                return res.status(404).json({ error: 'User not found or access denied' })
            }

            const user = await prisma.user.update({
                where: { id: targetUserId },
                data: { passwordHash: hashedPassword },
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            })

            // TODO: Send email with temporary password
            // For now, return it in the response (in production, this should be emailed)

            return res.status(200).json({ 
                message: 'Password reset successfully. Temporary password has been generated.',
                tempPassword, // Remove this in production and send via email
                user 
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to reset password' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
