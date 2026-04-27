/**
 * GET /api/clinic/geo-access-request-details?token=TOKEN
 * Returns public details of a geo access request for display on the approval page.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { token } = req.query
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'token is required' })
    }

    try {
        const request = await prisma.geoAccessRequest.findUnique({
            where: { approvalToken: token },
            select: {
                receptionistEmail: true,
                receptionistName: true,
                status: true,
                requestedAt: true,
                clinic: { select: { name: true, clinicId: true } }
            }
        })

        if (!request) {
            return res.status(404).json({ error: 'Request not found' })
        }

        return res.status(200).json({
            receptionistEmail: request.receptionistEmail,
            receptionistName: request.receptionistName,
            status: request.status,
            requestedAt: request.requestedAt,
            clinicName: request.clinic.name,
            clinicId: request.clinic.clinicId
        })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch request details' })
    }
}
