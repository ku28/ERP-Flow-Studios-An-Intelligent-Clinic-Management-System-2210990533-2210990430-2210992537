import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'
import { getUpgradeRequestByToken } from '../../../lib/upgradeRequests'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const authUser = await getSessionUser(req)
    if (!authUser || authUser.role !== 'admin' || !authUser.clinicId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = typeof req.query.token === 'string' ? req.query.token : ''
    if (!token) {
        return res.status(400).json({ error: 'token is required' })
    }

    const request = await getUpgradeRequestByToken(token)
    if (!request) {
        return res.status(404).json({ error: 'Request not found' })
    }

    if (request.clinicId !== authUser.clinicId) {
        return res.status(403).json({ error: 'Access denied' })
    }

    return res.status(200).json({
        status: request.status,
        requestedPlan: request.requestedPlan,
        requestedCycle: request.requestedCycle,
        createdAt: request.createdAt,
        decidedAt: request.decidedAt || null,
        notes: request.notes || null,
    })
}
