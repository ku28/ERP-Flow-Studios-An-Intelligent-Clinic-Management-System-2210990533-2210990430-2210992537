/**
 * GET /api/clinic/geo-access-status?requestId=ID
 * Polls the status of a geo access request.
 * Returns status: pending | approved | denied
 * On approved: also returns a redeemUrl for auto-login.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { requestId } = req.query

    if (!requestId || typeof requestId !== 'string') {
        return res.status(400).json({ error: 'requestId is required' })
    }

    try {
        const request = await prisma.geoAccessRequest.findUnique({
            where: { id: requestId },
            select: {
                status: true,
                sessionToken: true,
                expiresAt: true,
                approvedBy: true,
                clinic: { select: { clinicId: true, name: true } }
            }
        })

        if (!request) {
            return res.status(404).json({ error: 'Request not found' })
        }

        if (request.status === 'approved' && request.sessionToken) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            return res.status(200).json({
                status: 'approved',
                redeemUrl: `${appUrl}/api/clinic/geo-access-redeem?token=${encodeURIComponent(request.sessionToken)}&clinicId=${request.clinic.clinicId}`,
                expiresAt: request.expiresAt,
                clinicName: request.clinic.name
            })
        }

        return res.status(200).json({ status: request.status })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to check status' })
    }
}
