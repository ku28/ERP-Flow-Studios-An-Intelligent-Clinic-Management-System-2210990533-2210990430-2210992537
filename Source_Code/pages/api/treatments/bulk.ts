import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireDoctorOrAdmin } from '../../../lib/auth'
import { getClinicAwareDoctorFilter, getDoctorIdForCreate } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return

    if (req.method === 'POST') {
        // Bulk create treatments
        const { treatments, mode = 'create', overrideDoctorId, matchByDiagnosis = false } = req.body // mode can be 'create' or 'upsert'

        if (!Array.isArray(treatments) || treatments.length === 0) {
            return res.status(400).json({ error: 'Invalid treatments array' })
        }


        try {
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const clinicId = user.clinicId || user.clinic?.id
            // If admin provides an overrideDoctorId, use it; otherwise fall back to user's own ID
            const effectiveDoctorId = (user.role === 'admin' || user.role === 'receptionist') && overrideDoctorId
                ? Number(overrideDoctorId)
                : getDoctorIdForCreate(user)
            const normalizeField = (value?: string | null) => String(value || '').trim()
            const normalizeKeyPart = (value?: string | null) => normalizeField(value).toLowerCase()
            const buildPlanKey = (planNumber?: string | null, provDiagnosis?: string | null) => `${normalizeKeyPart(planNumber)}/${normalizeKeyPart(provDiagnosis)}`

            // De-duplicate rows in the same import by provDiagnosis+planNumber (last row wins).
            const keyedTreatments = new Map<string, any>()
            const unkeyedTreatments: any[] = []
            for (const t of treatments) {
                const provDiagnosis = normalizeField(t?.provDiagnosis)
                const planNumber = normalizeField(t?.planNumber)
                if (provDiagnosis && planNumber) {
                    keyedTreatments.set(buildPlanKey(planNumber, provDiagnosis), { ...t, provDiagnosis, planNumber })
                } else {
                    unkeyedTreatments.push(t)
                }
            }
            const normalizedTreatments = [...keyedTreatments.values(), ...unkeyedTreatments]
            const duplicateRowsSkipped = treatments.length - normalizedTreatments.length
            if (duplicateRowsSkipped > 0) {
            }

            // Collect all unique product names from all treatments (including option names)
            const allProductNames = new Set<string>()
            normalizedTreatments.forEach((t: any) => {
                if (t.products && Array.isArray(t.products)) {
                    t.products.forEach((p: any) => {
                        const productName = (p.productName || '').trim().toUpperCase()
                        if (productName) {
                            allProductNames.add(productName)
                        }
                        // Also collect option product names
                        if (Array.isArray(p.optionProductNames)) {
                            p.optionProductNames.forEach((n: string) => {
                                const on = n.trim().toUpperCase()
                                if (on) allProductNames.add(on)
                            })
                        }
                    })
                }
            })


            // Get existing products from database (case-insensitive match)
            const existingProducts = await prisma.product.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true
                }
            })

            // Create a map of product names to IDs (case-insensitive)
            const productNameToId = new Map<string, number>()
            existingProducts.forEach((p: any) => {
                productNameToId.set(p.name.toUpperCase(), p.id)
            })


            // Find products that need to be created as placeholders (quantity 0, price 0)
            const productsToCreate: string[] = []
            allProductNames.forEach(name => {
                if (!productNameToId.has(name)) {
                    productsToCreate.push(name)
                }
            })

            // Create placeholder products for non-existent ones
            if (productsToCreate.length > 0) {
                
                for (const productName of productsToCreate) {
                    // Create product with quantity 0 and price 0 (won't appear in active inventory)
                    const newProduct = await prisma.product.create({
                        data: {
                            name: productName,
                            priceRupees: 0,
                            quantity: 0,
                            doctorId: effectiveDoctorId
                        }
                    })
                    productNameToId.set(productName.toUpperCase(), newProduct.id)
                }
            }


            // Pre-fetch all existing keyed treatments in this clinic and index by normalized key.
            // This prevents duplicate creates when legacy rows differ only by casing/whitespace.
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

            const existingTreatmentMap = new Map<string, any[]>()
            const existingDiagnosisMap = new Map<string, any[]>()
            existingTreatments.forEach((t: any) => {
                const normalizedPlanNumber = normalizeField(t.planNumber)
                const normalizedProvDiagnosis = normalizeField(t.provDiagnosis)
                if (!normalizedPlanNumber || !normalizedProvDiagnosis) return

                const key = buildPlanKey(normalizedPlanNumber, normalizedProvDiagnosis)
                const current = existingTreatmentMap.get(key) || []
                current.push(t)
                existingTreatmentMap.set(key, current)

                const diagnosisKey = normalizeKeyPart(normalizedProvDiagnosis)
                const diagnosisCurrent = existingDiagnosisMap.get(diagnosisKey) || []
                diagnosisCurrent.push(t)
                existingDiagnosisMap.set(diagnosisKey, diagnosisCurrent)
            })
            const claimedExistingIds = new Set<number>()


            // Process treatments with controlled concurrency to avoid connection pool exhaustion
            const BATCH_SIZE = 50 // Reduced to match frontend chunk size
            const CONCURRENCY_LIMIT = 8 // Optimized for performance with pgbouncer
            const results: any[] = []
            const errors: any[] = []
            
            // Split treatments into chunks
            const chunks = []
            for (let i = 0; i < normalizedTreatments.length; i += BATCH_SIZE) {
                chunks.push(normalizedTreatments.slice(i, i + BATCH_SIZE))
            }

            // Process each chunk with limited concurrency
            for (const chunk of chunks) {
                // Further split chunk into smaller concurrent batches
                for (let i = 0; i < chunk.length; i += CONCURRENCY_LIMIT) {
                    const concurrentBatch = chunk.slice(i, i + CONCURRENCY_LIMIT)
                    
                    const chunkPromises = concurrentBatch.map(async (treatmentData: any, index: number) => {
                    try {
                        const {
                            provDiagnosis, planNumber, speciality, imbalance, systems, organ, diseaseAction, 
                            pulseDiagnosis, treatmentPlan, administration, notes, products 
                        } = treatmentData
                        const normalizedProvDiagnosis = normalizeField(provDiagnosis)
                        const normalizedPlanNumber = normalizeField(planNumber)

                        // Map product names to IDs (all products now exist as placeholders if needed)
                        const productsWithIds = (products || []).map((p: any) => {
                            const productName = (p.productName || '').trim().toUpperCase()
                            
                            // Skip if no product name provided
                            if (!productName) {
                                return null
                            }
                            
                            const productId = productNameToId.get(productName)
                            
                            // All products should exist now (either real or placeholder)
                            if (!productId) {
                                return null
                            }
                            
                            return {
                                productId: productId,
                                spy1: p.spy1 || null,
                                spy2: p.spy2 || null,
                                spy3: p.spy3 || null,
                                spy4: p.spy4 || null,
                                spy5: p.spy5 || null,
                                spy6: p.spy6 || null,
                                timing: p.timing || null,
                                dosage: p.dosage || null,
                                addition1: p.addition1 || null,
                                addition2: p.addition2 || null,
                                addition3: p.addition3 || null,
                                procedure: p.procedure || null,
                                presentation: p.presentation || null,
                                bottleSize: p.bottleSize || null,
                                quantity: p.quantity ? parseInt(String(p.quantity)) : null,
                                administration: p.administration || null,
                                optionProductIds: (() => {
                                    const opts: number[] = []
                                    if (Array.isArray(p.optionProductNames)) {
                                        p.optionProductNames.forEach((n: string) => {
                                            const oid = productNameToId.get(n.trim().toUpperCase())
                                            if (oid) opts.push(oid)
                                        })
                                    }
                                    return opts.length > 0 ? JSON.stringify(opts) : null
                                })()
                            }
                        }).filter((p: any) => p !== null) // Remove entries with no product name

                        // Check if treatment exists using pre-fetched clinic-scoped map.
                        const treatmentKey = normalizedProvDiagnosis && normalizedPlanNumber
                            ? buildPlanKey(normalizedPlanNumber, normalizedProvDiagnosis)
                            : null
                        const existingMatches = treatmentKey ? (existingTreatmentMap.get(treatmentKey) || []) : []

                        if (existingMatches.length > 0) {
                            if (mode === 'create') {
                                return null
                            }

                            // Update all matching treatments in-place so visits tied to any matching
                            // treatmentId keep working and see the updated plan content.
                            for (const existing of existingMatches) {
                                claimedExistingIds.add(existing.id)
                                await prisma.treatmentProduct.deleteMany({
                                    where: { treatmentId: existing.id }
                                })

                                await prisma.treatment.update({
                                    where: { id: existing.id },
                                    data: {
                                        speciality,
                                        imbalance,
                                        systems,
                                        organ,
                                        diseaseAction,
                                        pulseDiagnosis,
                                        treatmentPlan,
                                        administration,
                                        notes,
                                        deleted: false,
                                        treatmentProducts: {
                                            create: productsWithIds
                                        }
                                    }
                                })
                            }

                            return { updatedIds: existingMatches.map((m: any) => m.id) }
                        }

                        // Optional fallback for upsert: if plan numbers shifted, match one existing
                        // treatment by the same provisional diagnosis and update it in-place.
                        if (mode === 'upsert' && matchByDiagnosis && normalizedProvDiagnosis) {
                            const diagnosisKey = normalizeKeyPart(normalizedProvDiagnosis)
                            const diagnosisCandidates = (existingDiagnosisMap.get(diagnosisKey) || [])
                                .filter((candidate: any) => !claimedExistingIds.has(candidate.id))

                            if (diagnosisCandidates.length > 0) {
                                const fallbackExisting = diagnosisCandidates.sort((a: any, b: any) => a.id - b.id)[0]
                                claimedExistingIds.add(fallbackExisting.id)

                                await prisma.treatmentProduct.deleteMany({
                                    where: { treatmentId: fallbackExisting.id }
                                })

                                await prisma.treatment.update({
                                    where: { id: fallbackExisting.id },
                                    data: {
                                        provDiagnosis: normalizedProvDiagnosis || null,
                                        planNumber: normalizedPlanNumber || null,
                                        speciality,
                                        imbalance,
                                        systems,
                                        organ,
                                        diseaseAction,
                                        pulseDiagnosis,
                                        treatmentPlan,
                                        administration,
                                        notes,
                                        deleted: false,
                                        treatmentProducts: {
                                            create: productsWithIds
                                        }
                                    }
                                })

                                return { updatedIds: [fallbackExisting.id], fallbackByDiagnosis: true }
                            }
                        }

                        // Create new treatment (no existing record found).
                        // Recover from unique races by switching to update when the conflicting
                        // record belongs to this clinic.
                        try {
                            return await prisma.treatment.create({
                                data: {
                                    provDiagnosis: normalizedProvDiagnosis || null,
                                    planNumber: normalizedPlanNumber || null,
                                    speciality,
                                    imbalance,
                                    systems,
                                    organ,
                                    diseaseAction,
                                    pulseDiagnosis,
                                    treatmentPlan,
                                    administration,
                                    notes,
                                    doctorId: effectiveDoctorId,
                                    treatmentProducts: {
                                        create: productsWithIds
                                    }
                                }
                            })
                        } catch (createErr: any) {
                            // Handle unique constraint violation (race condition)
                            // The unique constraint is now [doctorId, provDiagnosis, planNumber]
                            if (createErr?.code === 'P2002' && normalizedProvDiagnosis && normalizedPlanNumber) {
                                const conflicting = await prisma.treatment.findFirst({
                                    where: {
                                        ...whereClause,
                                        AND: [
                                            { provDiagnosis: { equals: normalizedProvDiagnosis, mode: 'insensitive' as const } },
                                            { planNumber: { equals: normalizedPlanNumber, mode: 'insensitive' as const } }
                                        ]
                                    },
                                    include: {
                                        doctor: {
                                            select: { clinicId: true }
                                        }
                                    }
                                })

                                if (conflicting && conflicting.doctor?.clinicId === clinicId) {
                                    // It's our clinic's treatment - update it
                                    await prisma.treatmentProduct.deleteMany({
                                        where: { treatmentId: conflicting.id }
                                    })

                                    return await prisma.treatment.update({
                                        where: { id: conflicting.id },
                                        data: {
                                            speciality,
                                            imbalance,
                                            systems,
                                            organ,
                                            diseaseAction,
                                            pulseDiagnosis,
                                            treatmentPlan,
                                            administration,
                                            notes,
                                            deleted: false,
                                            treatmentProducts: {
                                                create: productsWithIds
                                            }
                                        }
                                    })
                                }

                                // Shouldn't happen with the new per-doctor constraint, but just in case
                                throw new Error(
                                    `Unique plan conflict for ${normalizedPlanNumber} (${normalizedProvDiagnosis}). This plan already exists for another doctor.`
                                )
                            }

                            throw createErr
                        }
                    } catch (err: any) {
                        // Track individual errors but continue processing
                        const errorDetail = {
                            planNumber: treatmentData.planNumber,
                            provDiagnosis: treatmentData.provDiagnosis,
                            error: err.message,
                            code: err.code
                        }
                        errors.push(errorDetail)
                        return null
                    }
                })

                // Wait for current concurrent batch to complete
                const batchResults = await Promise.all(chunkPromises)
                results.push(...batchResults.filter(r => r !== null))
                
                // Small delay between batches to allow connection pool to recover
                await new Promise(resolve => setTimeout(resolve, 50))
                }
            }


            return res.status(201).json({ 
                success: true, 
                count: results.length,
                duplicateRowsSkipped,
                errors: errors.length > 0 ? errors : undefined,
                message: errors.length > 0 
                    ? `Imported ${results.length} treatments with ${errors.length} errors${duplicateRowsSkipped > 0 ? ` (${duplicateRowsSkipped} duplicate rows skipped)` : ''}` 
                    : `Successfully imported ${results.length} treatments${duplicateRowsSkipped > 0 ? ` (${duplicateRowsSkipped} duplicate rows skipped)` : ''}`
            })
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'DELETE') {
        // Bulk delete treatments
        const { ids } = req.body

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Invalid ids array' })
        }

        try {
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            // Mark all as deleted in a single query - instant for any amount
            const updated = await prisma.treatment.updateMany({
                where: {
                    id: { in: ids },
                    ...whereClause
                },
                data: {
                    deleted: true,
                    planNumber: null
                }
            })

            // Skip renumbering if too many records - can be done async or skipped
            // For better performance with large datasets, renumbering can be optional
            if (ids.length <= 100) {
                // Get all remaining non-deleted treatments to renumber them
                const remainingTreatments = await prisma.treatment.findMany({
                    where: {
                        ...whereClause,
                        deleted: { not: true },
                        planNumber: { not: null }
                    },
                    orderBy: {
                        planNumber: 'asc'
                    },
                    select: { id: true }
                })

                // Renumber plans in parallel batches
                const BATCH_SIZE = 20
                for (let i = 0; i < remainingTreatments.length; i += BATCH_SIZE) {
                    const batch = remainingTreatments.slice(i, i + BATCH_SIZE)
                    const updatePromises = batch.map((treatment: any, batchIndex: number) => {
                        const newPlanNumber = String(i + batchIndex + 1)
                        return prisma.treatment.update({
                            where: { id: treatment.id },
                            data: { planNumber: newPlanNumber }
                        })
                    })
                    await Promise.all(updatePromises)
                }
            }

            return res.status(200).json({ 
                success: true, 
                deletedCount: updated.count 
            })
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
