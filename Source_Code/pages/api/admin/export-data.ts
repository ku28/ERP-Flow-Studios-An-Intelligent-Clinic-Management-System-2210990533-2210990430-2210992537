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
            const format = req.query.format as string || 'json'

            // Get clinic filter
            const clinicId = getClinicIdFromUser(authUser)
            const doctorIds = await prisma.user.findMany({
                where: { clinicId, role: { in: ['doctor', 'admin'] } },
                select: { id: true }
            }).then((docs: { id: number }[]) => docs.map(d => d.id))

            // Fetch clinic-specific data
            const data = {
                patients: await prisma.patient.findMany({ where: { clinicId } }),
                products: await prisma.product.findMany({ where: { doctorId: { in: doctorIds } } }),
                visits: await prisma.visit.findMany({ where: { patient: { clinicId } } })
            }

            if (format === 'json') {
                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Content-Disposition', `attachment; filename=data-export.json`)
                return res.status(200).json(data)
            } else if (format === 'csv') {
                // Simple CSV export of patients
                const csv = [
                    'ID,Name,Email,Phone',
                    ...data.patients.map((p: any) => `${p.id},"${(`${p.firstName || ''} ${p.lastName || ''}`).trim()}",${p.email},${p.phone}`)
                ].join('\n')
                
                res.setHeader('Content-Type', 'text/csv')
                res.setHeader('Content-Disposition', `attachment; filename=data-export.csv`)
                return res.status(200).send(csv)
            } else if (format === 'xlsx') {
                // For Excel, you'd use a library like xlsx or exceljs
                res.setHeader('Content-Type', 'application/json')
                return res.status(200).json({ error: 'Excel export not implemented yet' })
            }

            return res.status(400).json({ error: 'Invalid format' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to export data' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
