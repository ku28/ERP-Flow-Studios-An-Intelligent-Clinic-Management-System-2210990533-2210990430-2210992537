import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import prisma from '../../../lib/prisma'

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
            // Get clinic filter
            const clinicId = getClinicIdFromUser(authUser)
            const doctorIds = await prisma.user.findMany({
                where: { clinicId, role: { in: ['doctor', 'admin'] } },
                select: { id: true }
            }).then((docs: { id: number }[]) => docs.map(d => d.id))

            const [totalUsers, totalPatients, totalProducts, totalVisits] = await Promise.all([
                prisma.user.count({ where: { clinicId } }),
                prisma.patient.count({ where: { clinicId } }),
                prisma.product.count({ where: { doctorId: { in: doctorIds } } }),
                prisma.visit.count({ where: { patient: { clinicId } } })
            ])

            const stats = {
                totalUsers,
                totalPatients,
                totalProducts,
                totalVisits,
                databaseSize: 'N/A', // Can be calculated if needed
                activeSessions: totalUsers // Simplified
            }

            return res.status(200).json({ stats })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch system stats' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
