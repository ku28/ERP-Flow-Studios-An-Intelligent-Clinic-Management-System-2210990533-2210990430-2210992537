import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import prisma from '../../../lib/prisma'
import { isFeatureAllowed } from '../../../lib/subscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed((authUser as any).clinic?.subscriptionPlan, 'export')) {
        return res.status(403).json({
            error: 'Export is available in Standard plan.',
            code: 'FEATURE_RESTRICTED',
            upgradeUrl: '/upgrade',
        })
    }

    if (req.method === 'GET') {
        try {
            const clinicId = getClinicIdFromUser(authUser)
            const users = await prisma.user.findMany({
                where: { clinicId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    phone: true,
                    createdAt: true
                }
            })

            const csv = [
                'ID,Name,Email,Role,Phone,Created At',
                ...users.map((u: any) => `${u.id},"${u.name}","${u.email}","${u.role}","${u.phone || ''}","${u.createdAt}"`)
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename=users-export.csv`)
            return res.status(200).send(csv)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to export users' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
