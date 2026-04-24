import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const clinicId = user.clinicId || user.clinic?.id
        if (!clinicId) {
            return res.status(400).json({ error: 'User must be associated with a clinic' })
        }

        const [
            latestProductVersionResult,
            latestTreatmentVersionResult,
            productSyncResult,
            treatmentSyncResult,
            globalDefaultRows,
        ] = await Promise.all([
            prisma.defaultProduct.aggregate({ _max: { version: true } }),
            prisma.defaultTreatment.aggregate({ _max: { version: true } }),
            prisma.clinicDefaultTemplateSync.aggregate({
                where: { clinicId, templateType: 'product' },
                _max: { version: true },
            }),
            prisma.clinicDefaultTemplateSync.aggregate({
                where: { clinicId, templateType: 'treatment' },
                _max: { version: true },
            }),
            prisma.defaultValue.findMany({
                where: {
                    clinicId: null,
                    page: { in: ['products', 'treatments'] }
                },
                select: {
                    page: true,
                    values: true
                }
            }),
        ])

        const latestProductVersion = latestProductVersionResult._max.version || 0
        const latestTreatmentVersion = latestTreatmentVersionResult._max.version || 0
        const syncedProductVersion = productSyncResult._max.version || 0
        const syncedTreatmentVersion = treatmentSyncResult._max.version || 0

        const globalDefaultsByPage = new Map<string, any>()
        globalDefaultRows.forEach((row: any) => {
            globalDefaultsByPage.set(row.page, row.values || {})
        })

        const productImportPulseEnabled = (globalDefaultsByPage.get('products')?.showImportPulseForNewDefaults as boolean | undefined) !== false
        const treatmentImportPulseEnabled = (globalDefaultsByPage.get('treatments')?.showImportPulseForNewDefaults as boolean | undefined) !== false

        return res.status(200).json({
            latestProductVersion,
            latestTreatmentVersion,
            syncedProductVersion,
            syncedTreatmentVersion,
            hasNewProductDefaults: latestProductVersion > 0 && syncedProductVersion < latestProductVersion,
            hasNewTreatmentDefaults: latestTreatmentVersion > 0 && syncedTreatmentVersion < latestTreatmentVersion,
            productImportPulseEnabled,
            treatmentImportPulseEnabled,
        })
    } catch (error: any) {
        return res.status(500).json({ error: error?.message || 'Failed to fetch default template status' })
    }
}
