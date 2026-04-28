import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify user is super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const superAdmin = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!superAdmin || superAdmin.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        const { userId, newRole } = req.body

        if (!userId || !newRole) {
            return res.status(400).json({ error: 'Invalid request. User ID and new role are required' })
        }

        const validRoles = ['admin', 'doctor', 'receptionist', 'staff']
        if (!validRoles.includes(newRole)) {
            return res.status(400).json({ error: 'Invalid role' })
        }

        // Get user details for audit log
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                clinic: true
            }
        })

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        const oldRole = user.role

        // Check if this is the last admin of a clinic and we're changing their role
        if (oldRole === 'admin' && newRole !== 'admin' && user.clinicId) {
            const adminCount = await prisma.user.count({
                where: {
                    clinicId: user.clinicId,
                    role: 'admin'
                }
            })

            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot change role of the last admin of a clinic' })
            }
        }

        // Update user role
        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'Change User Role',
                category: 'user_management',
                userId: superAdmin.id,
                userName: superAdmin.name,
                userRole: superAdmin.role,
                clinicId: user.clinicId,
                clinicName: user.clinic?.name || null,
                details: {
                    targetUserId: userId,
                    targetUserName: user.name,
                    targetUserEmail: user.email,
                    oldRole,
                    newRole
                },
                ipAddress: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null,
                timestamp: new Date()
            }
        }).catch(() => {
            // Ignore audit log errors to not block the operation
        })

        return res.status(200).json({ 
            success: true,
            message: 'User role changed successfully'
        })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to change user role' })
    }
}
