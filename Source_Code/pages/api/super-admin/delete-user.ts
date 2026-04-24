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

        const { userId } = req.body

        if (!userId) {
            return res.status(400).json({ error: 'Invalid request. User ID is required' })
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

        // Check if this is the last admin of a clinic
        if (user.role === 'admin' && user.clinicId) {
            const adminCount = await prisma.user.count({
                where: {
                    clinicId: user.clinicId,
                    role: 'admin'
                }
            })

            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last admin of a clinic' })
            }
        }

        // Store user details before deletion
        const userDetails = {
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            userRole: user.role,
            clinicId: user.clinicId,
            clinicName: user.clinic?.name || null
        }

        // Delete the user
        await prisma.user.delete({
            where: { id: userId }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'Delete User',
                category: 'user_management',
                userId: superAdmin.id,
                userName: superAdmin.name,
                userRole: superAdmin.role,
                clinicId: userDetails.clinicId,
                clinicName: userDetails.clinicName,
                details: userDetails,
                ipAddress: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null,
                timestamp: new Date()
            }
        }).catch(() => {
            // Ignore audit log errors to not block the operation
        })

        return res.status(200).json({ 
            success: true,
            message: 'User deleted successfully'
        })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to delete user' })
    }
}
