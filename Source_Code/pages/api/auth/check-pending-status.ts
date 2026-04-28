import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { email } = req.query

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' })
    }

    try {
        // Check if user has been approved (moved to User table)
        const approvedUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, role: true, isVerified: true }
        })

        if (approvedUser) {
            return res.status(200).json({
                status: 'approved',
                message: 'Your account has been approved! You can now log in.'
            })
        }

        // Check pending user record
        const pendingUser = await prisma.pendingUser.findUnique({
            where: { email }
        })

        if (!pendingUser) {
            return res.status(200).json({
                status: 'not_found',
                message: 'No pending registration found for this email.'
            })
        }

        // Check if expired
        if (new Date() > pendingUser.expiresAt && pendingUser.status === 'pending') {
            await prisma.pendingUser.update({
                where: { id: pendingUser.id },
                data: { status: 'expired' }
            })
            return res.status(200).json({
                status: 'expired',
                message: 'Registration request has expired. Please sign up again.'
            })
        }

        return res.status(200).json({
            status: pendingUser.status,
            message: pendingUser.status === 'pending'
                ? 'Waiting for admin approval'
                : pendingUser.status === 'approved'
                    ? 'Your account has been approved!'
                    : 'Registration request has expired'
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
