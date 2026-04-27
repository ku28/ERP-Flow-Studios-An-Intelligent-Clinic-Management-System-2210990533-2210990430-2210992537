/**
 * POST /api/clinic/geo-access-approve?token=TOKEN&action=approve|deny
 * Approves or denies a geo access request by the approver clicking the email link.
 * After approval: creates a 30-min session for the receptionist and stores it in the request.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import bcrypt from 'bcryptjs'
import { createSessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { token, action, approverEmail } = req.body

    if (!token || !action) {
        return res.status(400).json({ error: 'token and action are required' })
    }

    if (action !== 'approve' && action !== 'deny') {
        return res.status(400).json({ error: 'action must be approve or deny' })
    }

    try {
        const request = await prisma.geoAccessRequest.findUnique({
            where: { approvalToken: token },
            include: {
                clinic: {
                    select: { id: true, clinicId: true, name: true }
                }
            }
        })

        if (!request) {
            return res.status(404).json({ error: 'Request not found' })
        }

        if (request.status !== 'pending') {
            return res.status(200).json({
                success: true,
                alreadyActioned: true,
                status: request.status,
                message: `This request was already ${request.status}.`
            })
        }

        if (action === 'deny') {
            await prisma.geoAccessRequest.update({
                where: { id: request.id },
                data: {
                    status: 'denied',
                    approvedAt: new Date(),
                    approvedBy: approverEmail || 'admin'
                }
            })
            return res.status(200).json({ success: true, status: 'denied' })
        }

        // --- APPROVE ---
        // Find the user by email in this clinic
        const user = await prisma.user.findFirst({
            where: {
                email: request.receptionistEmail,
                clinicId: request.clinic.id
            }
        })

        if (!user) {
            return res.status(404).json({
                error: `No user with email "${request.receptionistEmail}" found in ${request.clinic.name}. Cannot auto-login.`
            })
        }

        // Create a 30-min session token
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
        const sessionToken = createSessionToken({
            sub: user.id,
            clinicId: request.clinic.clinicId,
            role: user.role,
            tempAccess: true
        })

        // Record the session in SessionRecord with expiresAt
        await prisma.sessionRecord.create({
            data: {
                userId: user.id,
                clinicId: request.clinic.id,
                sessionToken,
                isActive: true,
                expiresAt
            }
        })

        // Update the geo access request
        await prisma.geoAccessRequest.update({
            where: { id: request.id },
            data: {
                status: 'approved',
                approvedAt: new Date(),
                expiresAt,
                approvedBy: approverEmail || 'admin',
                sessionToken
            }
        })

        return res.status(200).json({
            success: true,
            status: 'approved',
            userName: user.name,
            clinicName: request.clinic.name,
            expiresAt: expiresAt.toISOString()
        })
    } catch (error) {
        console.error('Geo access approve error:', error)
        return res.status(500).json({ error: 'Failed to process approval' })
    }
}
