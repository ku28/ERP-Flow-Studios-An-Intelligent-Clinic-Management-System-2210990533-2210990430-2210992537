import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove, getClinicIdFromUser } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const clinicId = getClinicIdFromUser(user)
        const productScopeFilter = await getClinicAwareDoctorFilter(user, prisma)

        const [productUsageRow, treatmentUsageRow, productCatalogCount] = await Promise.all([
            prisma.prescription.findFirst({
                where: {
                    productId: { not: null },
                    visit: { patient: { clinicId } }
                },
                select: { id: true }
            }),
            prisma.prescription.findFirst({
                where: {
                    treatmentId: { not: null },
                    visit: { patient: { clinicId } }
                },
                select: { id: true }
            }),
            prisma.product.count({ where: productScopeFilter })
        ])

        const hasProductsInUseByVisits = Boolean(productUsageRow)
        const hasTreatmentsInUseByVisits = Boolean(treatmentUsageRow)
        const canResetAndPopulate = !hasProductsInUseByVisits && !hasTreatmentsInUseByVisits

        return res.status(200).json({
            canResetAndPopulate,
            hasProductsInUseByVisits,
            hasTreatmentsInUseByVisits,
            productCatalogCount,
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
