import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import bcrypt from 'bcryptjs'

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

        const { userId, newPassword } = req.body

        if (!userId || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Invalid request. Password must be at least 6 characters' })
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

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10)

        // Update user password
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hashedPassword }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'Reset User Password',
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
                    targetUserRole: user.role
                },
                ipAddress: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null,
                timestamp: new Date()
            }
        }).catch(() => {
            // Ignore audit log errors to not block the operation
        })

        return res.status(200).json({ 
            success: true,
            message: 'Password reset successfully'
        })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to reset password' })
    }
}
