import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireDoctorOrAdmin } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const latestVersionResult = await prisma.defaultTreatment.aggregate({
            _max: { version: true }
        })
        const latestVersion = latestVersionResult._max.version

        if (!latestVersion) {
            return res.status(404).json({ error: 'No default treatment templates found' })
        }

        const defaults = await prisma.defaultTreatment.findMany({
            where: { version: latestVersion },
            orderBy: { id: 'asc' }
        })

        const treatments = defaults
            .filter((row: any) => String(row?.planNumber || '').trim() !== '')
            .map((row: any) => ({
                planNumber: String(row.planNumber || '').trim(),
                provDiagnosis: row.provDiagnosis || undefined,
                speciality: row.speciality || undefined,
                imbalance: row.imbalance || undefined,
                systems: row.systems || undefined,
                organ: row.organ || undefined,
                diseaseAction: row.diseaseAction || undefined,
                pulseDiagnosis: row.pulseDiagnosis || undefined,
                treatmentPlan: row.treatmentPlan || undefined,
                notes: row.notes || undefined,
                drn: row.drn || undefined,
                productName: row.productName || undefined,
                spy1: row.spy1 || undefined,
                spy2: row.spy2 || undefined,
                spy3: row.spy3 || undefined,
                spy4: row.spy4 || undefined,
                spy5: row.spy5 || undefined,
                spy6: row.spy6 || undefined,
                timing: row.timing || undefined,
                dosage: row.dosage || undefined,
                doseQuantity: row.doseQuantity || undefined,
                doseTiming: row.doseTiming || undefined,
                dilution: row.dilution || undefined,
                addition1: row.addition1 || undefined,
                addition2: row.addition2 || undefined,
                addition3: row.addition3 || undefined,
                procedure: row.procedure || undefined,
                presentation: row.presentation || undefined,
                bottleSize: row.bottleSize || undefined,
                quantity: row.quantity !== null && row.quantity !== undefined ? String(row.quantity) : undefined,
                administration: row.administration || undefined
            }))

        return res.status(200).json({
            success: true,
            latestVersion,
            count: treatments.length,
            treatments
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
