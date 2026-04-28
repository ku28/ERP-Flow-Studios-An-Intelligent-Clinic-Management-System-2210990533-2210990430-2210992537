import type { NextApiRequest, NextApiResponse} from 'next'
import { getSessionUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'GET') {
        try {
            // Mock audit logs - implement actual logging system as needed
            const logs = [
                {
                    id: 1,
                    userId: authUser.id,
                    userName: authUser.name || 'Admin',
                    action: 'login',
                    details: 'User logged in successfully',
                    timestamp: new Date().toISOString()
                },
                {
                    id: 2,
                    userId: authUser.id,
                    userName: authUser.name || 'Admin',
                    action: 'view',
                    details: 'Viewed admin settings',
                    timestamp: new Date(Date.now() - 300000).toISOString()
                }
            ]

            return res.status(200).json({ logs })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch audit logs' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
