import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import prisma from '../../../lib/prisma'
import { canAssignRoleForBasicPlan, isBasicPlan, isFeatureAllowed } from '../../../lib/subscription'

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
            const { userId, role } = req.body
            const targetUserId = Number(userId)

            if (!targetUserId || !role) {
                return res.status(400).json({ error: 'User ID and role are required' })
            }

            // Prevent changing own role
            if (targetUserId === authUser.id) {
                return res.status(400).json({ error: 'You cannot change your own role' })
            }

            // Validate role
            const validRoles = ['admin', 'doctor', 'receptionist', 'staff', 'user']
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role' })
            }

            const clinicId = getClinicIdFromUser(authUser)
            const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { subscriptionPlan: true } })
            const targetUser = await prisma.user.findFirst({
                where: { id: targetUserId, clinicId },
                select: { id: true }
            })

            if (!targetUser) {
                return res.status(404).json({ error: 'User not found or access denied' })
            }

            if (isBasicPlan(clinic?.subscriptionPlan)) {
                const clinicUsers = await prisma.user.findMany({ where: { clinicId }, select: { id: true, role: true } })
                const limitCheck = canAssignRoleForBasicPlan(role, clinicUsers, targetUserId)
                if (!limitCheck.allowed) {
                    return res.status(400).json({ error: limitCheck.reason || 'Basic plan user limit exceeded' })
                }
            }

            const user = await prisma.user.update({
                where: { id: targetUserId },
                data: { role },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            })

            return res.status(200).json({ 
                message: `Role changed successfully to ${role}`,
                user 
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to change role' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
