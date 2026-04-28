import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireDoctorOrAdmin, requireAuth } from '../../lib/auth'
import { getDoctorIdForCreate, getClinicAwareDoctorFilter } from '../../lib/doctorUtils'
import { normalizeTreatmentKeywords, parseTreatmentKeywordsFromNotes, TreatmentKeyword } from '../../lib/treatmentKeywords'

function mergeKeywords(input: TreatmentKeyword[]): TreatmentKeyword[] {
    const map = new Map<string, number>()
    input.forEach((k) => {
        const word = String(k.word || '').trim().toLowerCase()
        if (!word) return
        const weight = Number(k.weight) || 1
        map.set(word, Math.max(map.get(word) || 0, Math.max(1, Math.round(weight))))
    })
    return Array.from(map.entries())
        .map(([word, weight]) => ({ word, weight }))
        .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word))
}

function appendNotesKeywords(existingNotes: string | null | undefined, missing: string[]): string {
    const notes = String(existingNotes || '').trim()
    const additions = missing.map((m) => `${m}:1`)
    if (!notes) return additions.join(', ')
    return `${notes}, ${additions.join(', ')}`
}

async function propagateDiagnosisKeywordsGlobally(provDiagnosis: string, sourceNotes: string | null | undefined) {
    const diagnosis = String(provDiagnosis || '').trim()
    if (!diagnosis) return

    const sourceKeywords = parseTreatmentKeywordsFromNotes(sourceNotes || '')
    if (sourceKeywords.length === 0) return

    const sourceWordSet = new Set(sourceKeywords.map((k) => String(k.word || '').toLowerCase()).filter(Boolean))
    if (sourceWordSet.size === 0) return

    const targets = await prisma.treatment.findMany({
        where: {
            AND: [
                { provDiagnosis: { equals: diagnosis, mode: 'insensitive' } },
                { OR: [{ deleted: false }, { deleted: null }] },
            ],
        },
        select: { id: true, notes: true, keywords: true },
    })

    for (const target of targets) {
        const current = normalizeTreatmentKeywords(target.keywords)
        const base = current.length > 0 ? current : parseTreatmentKeywordsFromNotes(target.notes)
        const existingWords = new Set(base.map((k) => String(k.word || '').toLowerCase()))
        const missing = Array.from(sourceWordSet).filter((w) => !existingWords.has(w))
        if (missing.length === 0) continue

        const extended = mergeKeywords([
            ...base,
            ...missing.map((m) => ({ word: m, weight: 1 })),
        ])

        await prisma.treatment.update({
            where: { id: target.id },
            data: {
                keywords: extended as any,
                notes: appendNotesKeywords(target.notes, missing),
            },
        })
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Treatments restricted to doctors and admins only
    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            const { id } = req.query
            const includeDeleted = req.query.includeDeleted === 'true'
            
            // Get clinic-aware filter
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            
            // If ID is provided, fetch single treatment
            if (id) {
                const treatment = await prisma.treatment.findFirst({
                    where: { id: Number(id), ...whereClause },
                    include: {
                        treatmentProducts: {
                            include: {
                                product: true
                            }
                        }
                    }
                })
                
                if (!treatment) {
                    return res.status(404).json({ error: 'Treatment not found or access denied' })
                }
                
                return res.status(200).json(treatment)
            }
            
            // Otherwise fetch all treatments
            const finalWhere = {
                ...whereClause,
                ...(includeDeleted ? {} : { OR: [{ deleted: false }, { deleted: null }] })
            }

            // Pagination support (optional)
            const page = req.query.page ? Math.max(1, Number(req.query.page)) : null
            const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : null
            const skip = page && limit ? (page - 1) * limit : undefined
            const take = limit || undefined
            
            const [items, total] = await Promise.all([
                prisma.treatment.findMany({ 
                    where: finalWhere,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take,
                    include: {
                        treatmentProducts: {
                            include: {
                                product: { select: { id: true, name: true, priceRupees: true, unit: true } }
                            }
                        }
                    }
                }),
                page ? prisma.treatment.count({ where: finalWhere }) : Promise.resolve(0),
            ])

            if (page && limit) {
                return res.status(200).json({
                    data: items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                })
            }

            return res.status(200).json(items)
        } catch (err: any) {
            // If the table/column doesn't exist yet, return empty list so frontend can load
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const user = await requireAuth(req, res)
        if(!user) return
        
        const { 
            provDiagnosis, planNumber, speciality, imbalance, systems, organ, diseaseAction, 
            treatmentPlan, administration, notes, products 
        } = req.body
        
        try {
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const productIds = [...new Set((products || []).map((p: any) => parseInt(p.productId)).filter((id: number) => Number.isInteger(id) && id > 0))]
            if (productIds.length > 0) {
                const clinicProducts = await prisma.product.findMany({
                    where: { id: { in: productIds }, ...whereClause },
                    select: { id: true }
                })
                if (clinicProducts.length !== productIds.length) {
                    return res.status(403).json({ error: 'One or more products are outside your clinic scope' })
                }
            }

            // Create treatment with products
            const t = await prisma.treatment.create({ 
                data: { 
                    provDiagnosis,
                    planNumber,
                    speciality,
                    imbalance,
                    systems,
                    organ,
                    diseaseAction,
                    treatmentPlan,
                    administration,
                    notes,
                    doctorId: getDoctorIdForCreate(user, req.body.doctorId),
                    // Create related products with medicine-specific fields
                    treatmentProducts: {
                        create: (products || []).map((p: any) => ({
                            productId: parseInt(p.productId),
                            quantity: p.quantity != null ? Number(p.quantity) : null,
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
                            administration: p.administration || null,
                            optionProductIds: p.optionProductIds ? JSON.stringify(p.optionProductIds) : null
                        }))
                    }
                },
                include: {
                    treatmentProducts: {
                        include: {
                            product: true
                        }
                    }
                }
            })

            await propagateDiagnosisKeywordsGlobally(provDiagnosis, notes)
            return res.status(201).json(t)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'PUT') {
        const user = await requireAuth(req, res)
        if(!user) return
        
        const { 
            id, provDiagnosis, planNumber, speciality, imbalance, systems, organ, diseaseAction, 
            treatmentPlan, administration, notes, products 
        } = req.body
        
        try {
            const treatmentId = parseInt(id)
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)

            const treatment = await prisma.treatment.findFirst({
                where: { id: treatmentId, ...whereClause },
                select: { id: true }
            })
            if (!treatment) {
                return res.status(404).json({ error: 'Treatment not found or access denied' })
            }

            const productIds = [...new Set((products || []).map((p: any) => parseInt(p.productId)).filter((pid: number) => Number.isInteger(pid) && pid > 0))]
            if (productIds.length > 0) {
                const clinicProducts = await prisma.product.findMany({
                    where: { id: { in: productIds }, ...whereClause },
                    select: { id: true }
                })
                if (clinicProducts.length !== productIds.length) {
                    return res.status(403).json({ error: 'One or more products are outside your clinic scope' })
                }
            }
            
            // Delete existing products and create new ones
            await prisma.treatmentProduct.deleteMany({
                where: { treatmentId: treatmentId }
            })
            
            // Update treatment with new products
            const t = await prisma.treatment.update({ 
                where: { id: treatmentId },
                data: { 
                    provDiagnosis,
                    planNumber,
                    speciality,
                    imbalance,
                    systems,
                    organ,
                    diseaseAction,
                    treatmentPlan,
                    administration,
                    notes,
                    doctorId: getDoctorIdForCreate(user, req.body.doctorId),
                    // Create new product relationships with medicine-specific fields
                    treatmentProducts: {
                        create: (products || []).map((p: any) => ({
                            productId: parseInt(p.productId),
                            quantity: p.quantity != null ? Number(p.quantity) : null,
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
                            administration: p.administration || null,
                            optionProductIds: p.optionProductIds ? JSON.stringify(p.optionProductIds) : null
                        }))
                    }
                },
                include: {
                    treatmentProducts: {
                        include: {
                            product: true
                        }
                    }
                }
            })

            await propagateDiagnosisKeywordsGlobally(provDiagnosis, notes)
            return res.status(200).json(t)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'DELETE') {
        const user = await requireAuth(req, res)
        if(!user) return
        
        const { id } = req.body
        try {
            // CRITICAL: Verify treatment belongs to user's clinic before deleting
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const treatment = await prisma.treatment.findFirst({ 
                where: { id, ...whereClause }
            })
            if (!treatment) {
                return res.status(404).json({ error: 'Treatment not found or access denied' })
            }

            const deletedPlanNumber = treatment.planNumber ? parseInt(treatment.planNumber, 10) : null

            // Mark as deleted instead of actually deleting
            await prisma.treatment.update({
                where: { id },
                data: {
                    deleted: true,
                    planNumber: null // Remove plan number from deleted treatments
                }
            })

            // If the deleted treatment had a plan number, renumber the remaining plans
            if (deletedPlanNumber !== null && !isNaN(deletedPlanNumber)) {
                // Get all non-deleted treatments with plan numbers greater than the deleted one
                const treatmentsToRenumber = await prisma.treatment.findMany({
                    where: {
                        ...whereClause,
                        deleted: { not: true },
                        planNumber: { not: null }
                    },
                    orderBy: { planNumber: 'asc' }
                })

                // Renumber plans sequentially starting from 1
                for (let i = 0; i < treatmentsToRenumber.length; i++) {
                    const newPlanNumber = String(i + 1)
                    await prisma.treatment.update({
                        where: { id: treatmentsToRenumber[i].id },
                        data: { planNumber: newPlanNumber }
                    })
                }
            }

            return res.status(200).json({ success: true })
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
