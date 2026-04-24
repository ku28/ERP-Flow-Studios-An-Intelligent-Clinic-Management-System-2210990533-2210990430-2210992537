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

        const { clinicId, newCode } = req.body

        if (!clinicId || !newCode || newCode.length !== 6) {
            return res.status(400).json({ error: 'Invalid request. Access code must be 6 characters' })
        }

        // Check if the new code already exists
        const existingClinic = await prisma.clinic.findUnique({
            where: { clinicId: newCode }
        })

        if (existingClinic && existingClinic.id !== clinicId) {
            return res.status(400).json({ error: 'Access code already in use' })
        }

        // Get clinic details before update for audit log
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }

        const oldCode = clinic.clinicId

        // Update clinic access code
        await prisma.clinic.update({
            where: { id: clinicId },
            data: { clinicId: newCode }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                action: 'Update Clinic Access Code',
                category: 'clinic_management',
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                clinicId: clinicId,
                clinicName: clinic.name,
                details: {
                    oldCode,
                    newCode,
                    clinicName: clinic.name
                },
                ipAddress: req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || null,
                timestamp: new Date()
            }
        }).catch(() => {
            // Ignore audit log errors to not block the operation
        })

        return res.status(200).json({ 
            success: true,
            message: 'Clinic access code updated successfully'
        })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to update clinic access code' })
    }
}
