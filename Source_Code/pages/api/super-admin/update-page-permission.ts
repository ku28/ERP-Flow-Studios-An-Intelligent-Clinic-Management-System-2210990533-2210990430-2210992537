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
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        const { role, page, field, value } = req.body

        if (!role || !page || !field || typeof value !== 'boolean') {
            return res.status(400).json({ error: 'Invalid request body' })
        }

        if (!['canAccess', 'canWrite'].includes(field)) {
            return res.status(400).json({ error: 'Invalid field. Must be canAccess or canWrite' })
        }

        // Find or create the permission
        const existingPermission = await prisma.pagePermission.findUnique({
            where: {
                role_page: {
                    role,
                    page
                }
            }
        })

        if (existingPermission) {
            // Update existing permission
            await prisma.pagePermission.update({
                where: {
                    role_page: {
                        role,
                        page
                    }
                },
                data: {
                    [field]: value,
                    // If removing access, also remove write permission
                    ...(field === 'canAccess' && !value ? { canWrite: false } : {})
                }
            })
        } else {
            // Create new permission
            await prisma.pagePermission.create({
                data: {
                    role,
                    page,
                    canAccess: field === 'canAccess' ? value : false,
                    canWrite: field === 'canWrite' ? value : false
                }
            })
        }

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'Update Page Permission',
                category: 'admin_settings',
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                clinicId: null,
                clinicName: null,
                details: {
                    role,
                    page,
                    field,
                    value
                },
                ipAddress: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null,
                timestamp: new Date()
            }
        }).catch(() => {
            // Ignore audit log errors to not block the operation
        })

        return res.status(200).json({ 
            success: true,
            message: 'Permission updated successfully'
        })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to update permission' })
    }
}
