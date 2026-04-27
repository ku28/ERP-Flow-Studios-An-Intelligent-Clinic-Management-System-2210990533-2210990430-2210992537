import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import { clearAllClinicSessions } from '../../../lib/sessionManager'
import { writeAuditLog } from '../../../lib/auditLog'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const authUser = await getSessionUser(req)
    if (!authUser) return res.status(401).json({ error: 'Not authenticated' })
    if (authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    const clinicInternalId = authUser.clinicId
    if (!clinicInternalId) return res.status(400).json({ error: 'No clinic associated with your account' })

    try {
        const cleared = await clearAllClinicSessions(clinicInternalId)

        await writeAuditLog({
            action: 'Force Clear All Sessions',
            category: 'security',
            severity: 'warning',
            userId: authUser.id,
            userName: authUser.name || authUser.email || 'Unknown',
            userRole: authUser.role,
            clinicId: authUser.clinic?.clinicId || null,
            clinicName: authUser.clinic?.name || null,
            details: { sessionsCleared: cleared },
            req,
        })

        return res.status(200).json({ ok: true, cleared })
    } catch (err) {
        return res.status(500).json({ error: 'Failed to clear sessions' })
    }
}
