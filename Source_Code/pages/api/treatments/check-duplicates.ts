import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireDoctorOrAdmin } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return

    try {
        // Expect array of { provDiagnosis, planNumber, index }
        const { treatments } = req.body as { treatments: Array<{ provDiagnosis?: string, planNumber?: string, index: number }> }

        if (!treatments || !Array.isArray(treatments)) {
            return res.status(400).json({ error: 'Invalid request body' })
        }

        const normalizeField = (value?: string) => String(value || '').trim()
        const normalizeKeyPart = (value?: string) => normalizeField(value).toLowerCase()
        const buildPlanKey = (planNumber?: string, provDiagnosis?: string) => `${normalizeKeyPart(planNumber)}/${normalizeKeyPart(provDiagnosis)}`

        const normalizedTreatments = treatments.map((t) => ({
            ...t,
            provDiagnosis: normalizeField(t.provDiagnosis),
            planNumber: normalizeField(t.planNumber)
        }))

        // Filter out treatments with no provDiagnosis or planNumber
        const validTreatments = normalizedTreatments.filter(t => t.provDiagnosis && t.planNumber)

        if (validTreatments.length === 0) {
            return res.status(200).json({
                duplicateIndices: [],
                uniqueIndices: treatments.map(t => t.index)
            })
        }

        // Build OR conditions for batch query.
        // Keep the current composite-key duplicate detection and also match by provisional diagnosis name.
        const uniquePlanEntries = Array.from(
            new Map(
                validTreatments.map((t) => [
                    buildPlanKey(t.planNumber, t.provDiagnosis),
                    { provDiagnosis: t.provDiagnosis, planNumber: t.planNumber }
                ])
            ).values()
        )

        const uniqueDiagnosisValues = Array.from(
            new Set(validTreatments.map(t => t.provDiagnosis).filter(Boolean) as string[])
        )

        const orConditions = [
            ...uniquePlanEntries.map(t => ({
                AND: [
                    { provDiagnosis: { equals: t.provDiagnosis, mode: 'insensitive' as const } },
                    { planNumber: t.planNumber }
                ]
            })),
            ...uniqueDiagnosisValues.map((provDiagnosis) => ({
                provDiagnosis: { equals: provDiagnosis, mode: 'insensitive' as const }
            }))
        ]

        const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)

        // Single batch query to check for duplicates
        const existingTreatments = await prisma.treatment.findMany({
            where: {
                ...doctorFilter,
                OR: orConditions
            },
            select: {
                provDiagnosis: true,
                planNumber: true
            }
        })

        // Create sets for O(1) lookups using composite key and diagnosis-only key.
        const existingPlanKeys = new Set(existingTreatments.map((t: any) => buildPlanKey(t.planNumber, t.provDiagnosis)))
        const existingDiagnosisKeys = new Set(existingTreatments.map((t: any) => normalizeKeyPart(t.provDiagnosis)))

        // Check each treatment against existing records
        const duplicateIndices: number[] = []
        const uniqueIndices: number[] = []

        normalizedTreatments.forEach(treatment => {
            if (!treatment.provDiagnosis || !treatment.planNumber) {
                uniqueIndices.push(treatment.index)
                return
            }

            const planKey = buildPlanKey(treatment.planNumber, treatment.provDiagnosis)
            const diagnosisKey = normalizeKeyPart(treatment.provDiagnosis)
            const isDuplicate = existingPlanKeys.has(planKey) || existingDiagnosisKeys.has(diagnosisKey)

            if (isDuplicate) {
                duplicateIndices.push(treatment.index)
            } else {
                uniqueIndices.push(treatment.index)
            }
        })

        return res.status(200).json({
            duplicateIndices,
            uniqueIndices
        })
    } catch (error: any) {
        return res.status(500).json({ error: 'Internal server error', details: error.message })
    }
}
