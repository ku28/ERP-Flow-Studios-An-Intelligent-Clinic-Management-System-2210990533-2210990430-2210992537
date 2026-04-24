import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireDoctorOrAdmin } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

type GroupedDefaultTreatment = {
    planNumber: string | null
    provDiagnosis: string | null
    speciality: string | null
    imbalance: string | null
    systems: string | null
    organ: string | null
    diseaseAction: string | null
    pulseDiagnosis: string | null
    treatmentPlan: string | null
    administration: string | null
    notes: string | null
    products: Array<{
        productName: string
        quantity: number | null
        spy1: string | null
        spy2: string | null
        spy3: string | null
        spy4: string | null
        spy5: string | null
        spy6: string | null
        timing: string | null
        dosage: string | null
        addition1: string | null
        addition2: string | null
        addition3: string | null
        procedure: string | null
        presentation: string | null
        bottleSize: string | null
        administration: string | null
    }>
}

function normalize(v?: string | null): string {
    return (v || '').trim().toUpperCase()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { reset = false } = req.body || {}
        const clinicId = user.clinicId || user.clinic?.id
        if (!clinicId) {
            return res.status(400).json({ error: 'User must be associated with a clinic' })
        }

        const latestVersionResult = await prisma.defaultTreatment.aggregate({
            _max: { version: true }
        })
        const latestVersion = latestVersionResult._max.version

        if (!latestVersion) {
            return res.status(404).json({ error: 'No default treatment templates found' })
        }

        if (!reset) {
            const alreadySynced = await prisma.clinicDefaultTemplateSync.findUnique({
                where: {
                    clinicId_templateType_version: {
                        clinicId,
                        templateType: 'treatment',
                        version: latestVersion
                    }
                }
            })

            if (alreadySynced) {
                return res.status(200).json({
                    success: true,
                    latestVersion,
                    alreadyPopulated: true,
                    created: 0,
                    updated: 0,
                    skipped: 0,
                    message: `Defaults for version ${latestVersion} were already populated for this clinic.`
                })
            }
        }

        const defaults = await prisma.defaultTreatment.findMany({
            where: { version: latestVersion },
            orderBy: { id: 'asc' }
        })

        if (defaults.length === 0) {
            return res.status(404).json({ error: `No default treatments found for version ${latestVersion}` })
        }

        const grouped = new Map<string, GroupedDefaultTreatment>()

        for (const row of defaults) {
            const planNumber = row.planNumber?.trim() || null
            const provDiagnosis = row.provDiagnosis?.trim() || null
            const fallback = row.name?.trim() || row.treatmentPlan?.trim() || `row_${row.id}`
            const groupKey = planNumber && provDiagnosis
                ? `PLAN_${provDiagnosis.toUpperCase()}_${planNumber.toUpperCase()}`
                : `FALLBACK_${fallback.toUpperCase()}`

            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, {
                    planNumber,
                    provDiagnosis,
                    speciality: row.speciality,
                    imbalance: row.imbalance,
                    systems: row.systems,
                    organ: row.organ,
                    diseaseAction: row.diseaseAction,
                    pulseDiagnosis: row.pulseDiagnosis,
                    treatmentPlan: row.treatmentPlan,
                    administration: row.administration,
                    notes: row.notes,
                    products: []
                })
            }

            if (row.productName && row.productName.trim()) {
                grouped.get(groupKey)!.products.push({
                    productName: row.productName.trim(),
                    quantity: row.quantity ?? null,
                    spy1: row.spy1 ?? null,
                    spy2: row.spy2 ?? null,
                    spy3: row.spy3 ?? null,
                    spy4: row.spy4 ?? null,
                    spy5: row.spy5 ?? null,
                    spy6: row.spy6 ?? null,
                    timing: row.timing ?? null,
                    dosage: row.dosage ?? null,
                    addition1: row.addition1 ?? null,
                    addition2: row.addition2 ?? null,
                    addition3: row.addition3 ?? null,
                    procedure: row.procedure ?? null,
                    presentation: row.presentation ?? null,
                    bottleSize: row.bottleSize ?? null,
                    administration: row.administration ?? null
                })
            }
        }

        const groupedTreatments = Array.from(grouped.values())
        const whereClause = await getClinicAwareDoctorFilter(user, prisma)

        const existingTreatments = await prisma.treatment.findMany({
            where: {
                ...whereClause,
                planNumber: { not: null },
                provDiagnosis: { not: null }
            },
            select: {
                id: true,
                doctorId: true,
                planNumber: true,
                provDiagnosis: true,
                deleted: true
            }
        })

        const existingPlanMap = new Map<string, Array<{ id: number; doctorId: number | null; deleted: boolean | null }>>()
        const existingDiagnosisMap = new Map<string, Array<{ id: number; doctorId: number | null; deleted: boolean | null }>>()
        existingTreatments.forEach((t: any) => {
            const normalizedPlanNumber = String(t.planNumber || '').trim()
            const normalizedProvDiagnosis = String(t.provDiagnosis || '').trim()
            if (!normalizedPlanNumber || !normalizedProvDiagnosis) return

            const key = `${normalize(normalizedProvDiagnosis)}__${normalize(normalizedPlanNumber)}`
            const current = existingPlanMap.get(key) || []
            current.push({ id: t.id, doctorId: t.doctorId ?? null, deleted: t.deleted ?? null })
            existingPlanMap.set(key, current)

            const diagnosisKey = normalize(normalizedProvDiagnosis)
            const diagnosisCurrent = existingDiagnosisMap.get(diagnosisKey) || []
            diagnosisCurrent.push({ id: t.id, doctorId: t.doctorId ?? null, deleted: t.deleted ?? null })
            existingDiagnosisMap.set(diagnosisKey, diagnosisCurrent)
        })

        const actorUserId = Number(user.id)

        const allProductNames = new Set<string>()
        groupedTreatments.forEach((t) => {
            t.products.forEach((p) => {
                if (p.productName) {
                    allProductNames.add(p.productName.trim().toUpperCase())
                }
            })
        })

        const productNames = Array.from(allProductNames)
        const existingProducts = productNames.length > 0
            ? await prisma.product.findMany({
                where: {
                    ...whereClause,
                    name: {
                        in: productNames,
                        mode: 'insensitive'
                    }
                },
                select: { id: true, name: true }
            })
            : []

        const productNameToId = new Map<string, number>()
        existingProducts.forEach((p: any) => productNameToId.set(p.name.trim().toUpperCase(), p.id))

        for (const productName of productNames) {
            if (!productNameToId.has(productName)) {
                const createdProduct = await prisma.product.create({
                    data: {
                        name: productName,
                        priceRupees: 0,
                        quantity: 0,
                        doctorId: actorUserId
                    },
                    select: { id: true, name: true }
                })
                productNameToId.set(createdProduct.name.trim().toUpperCase(), createdProduct.id)
            }
        }

        let created = 0
        let updated = 0
        let skipped = 0
        const claimedExistingIds = new Set<number>()

        for (const treatment of groupedTreatments) {
            const planKey = treatment.planNumber && treatment.provDiagnosis
                ? `${normalize(treatment.provDiagnosis)}__${normalize(treatment.planNumber)}`
                : null
            const diagnosisKey = treatment.provDiagnosis ? normalize(treatment.provDiagnosis) : null

            const treatmentProductsData = treatment.products
                .filter((p, index, arr) => arr.findIndex((candidate) => normalize(candidate.productName) === normalize(p.productName)) === index)
                .map((p) => {
                    const productId = productNameToId.get(p.productName.trim().toUpperCase())
                    if (!productId) return null

                    return {
                        productId,
                        quantity: p.quantity,
                        spy1: p.spy1,
                        spy2: p.spy2,
                        spy3: p.spy3,
                        spy4: p.spy4,
                        spy5: p.spy5,
                        spy6: p.spy6,
                        timing: p.timing,
                        dosage: p.dosage,
                        addition1: p.addition1,
                        addition2: p.addition2,
                        addition3: p.addition3,
                        procedure: p.procedure,
                        presentation: p.presentation,
                        bottleSize: p.bottleSize,
                        administration: p.administration
                    }
                })
                .filter(Boolean) as any[]

            if (planKey && existingPlanMap.has(planKey)) {
                if (!reset) {
                    skipped += 1
                    continue
                }

                const existingMatches = existingPlanMap.get(planKey)!

                for (const existing of existingMatches) {
                    claimedExistingIds.add(existing.id)
                    await prisma.treatmentProduct.deleteMany({ where: { treatmentId: existing.id } })
                    await prisma.treatment.update({
                        where: { id: existing.id },
                        data: {
                            planNumber: treatment.planNumber,
                            provDiagnosis: treatment.provDiagnosis,
                            speciality: treatment.speciality,
                            imbalance: treatment.imbalance,
                            systems: treatment.systems,
                            organ: treatment.organ,
                            diseaseAction: treatment.diseaseAction,
                            pulseDiagnosis: treatment.pulseDiagnosis,
                            treatmentPlan: treatment.treatmentPlan,
                            administration: treatment.administration,
                            notes: treatment.notes,
                            deleted: false,
                            treatmentProducts: { create: treatmentProductsData }
                        }
                    })
                }

                updated += 1
                continue
            }

            if (reset && diagnosisKey) {
                const diagnosisCandidates = (existingDiagnosisMap.get(diagnosisKey) || [])
                    .filter((candidate) => !claimedExistingIds.has(candidate.id))

                if (diagnosisCandidates.length > 0) {
                    const fallbackExisting = diagnosisCandidates.sort((a, b) => a.id - b.id)[0]
                    claimedExistingIds.add(fallbackExisting.id)

                    await prisma.treatmentProduct.deleteMany({ where: { treatmentId: fallbackExisting.id } })
                    await prisma.treatment.update({
                        where: { id: fallbackExisting.id },
                        data: {
                            planNumber: treatment.planNumber,
                            provDiagnosis: treatment.provDiagnosis,
                            speciality: treatment.speciality,
                            imbalance: treatment.imbalance,
                            systems: treatment.systems,
                            organ: treatment.organ,
                            diseaseAction: treatment.diseaseAction,
                            pulseDiagnosis: treatment.pulseDiagnosis,
                            treatmentPlan: treatment.treatmentPlan,
                            administration: treatment.administration,
                            notes: treatment.notes,
                            deleted: false,
                            treatmentProducts: { create: treatmentProductsData }
                        }
                    })

                    updated += 1
                    continue
                }
            }

            await prisma.treatment.create({
                data: {
                    planNumber: treatment.planNumber,
                    provDiagnosis: treatment.provDiagnosis,
                    speciality: treatment.speciality,
                    imbalance: treatment.imbalance,
                    systems: treatment.systems,
                    organ: treatment.organ,
                    diseaseAction: treatment.diseaseAction,
                    pulseDiagnosis: treatment.pulseDiagnosis,
                    treatmentPlan: treatment.treatmentPlan,
                    administration: treatment.administration,
                    notes: treatment.notes,
                    doctorId: actorUserId,
                    treatmentProducts: { create: treatmentProductsData }
                }
            })

            created += 1
        }

        if (reset) {
            await prisma.clinicDefaultTemplateSync.upsert({
                where: {
                    clinicId_templateType_version: {
                        clinicId,
                        templateType: 'treatment',
                        version: latestVersion
                    }
                },
                create: {
                    clinicId,
                    templateType: 'treatment',
                    version: latestVersion
                },
                update: {
                    populatedAt: new Date()
                }
            })
        } else {
            await prisma.clinicDefaultTemplateSync.create({
                data: {
                    clinicId,
                    templateType: 'treatment',
                    version: latestVersion
                }
            })
        }

        return res.status(200).json({
            success: true,
            latestVersion,
            alreadyPopulated: false,
            created,
            updated,
            skipped,
            message: reset
                ? `Reset and populated treatment defaults for version ${latestVersion}. Created ${created}, updated ${updated}, skipped ${skipped}.`
                : `Populated treatment defaults for version ${latestVersion}. Created ${created}, skipped ${skipped}.`
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
