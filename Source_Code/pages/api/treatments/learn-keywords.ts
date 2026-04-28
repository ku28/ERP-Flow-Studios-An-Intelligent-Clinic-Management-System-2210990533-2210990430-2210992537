import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireDoctorOrAdmin } from '../../../lib/auth'
import {
    normalizeTreatmentKeywords,
    parseTreatmentKeywordsFromNotes,
    parseComplaintTags,
    TreatmentKeyword,
} from '../../../lib/treatmentKeywords'

function mergeKeywords(input: TreatmentKeyword[]): TreatmentKeyword[] {
    const map = new Map<string, number>()
    input.forEach((k) => {
        const word = String(k.word || '').trim().toLowerCase()
        if (!word) return
        const weight = Number(k.weight) || 1
        map.set(word, (map.get(word) || 0) + Math.max(1, Math.round(weight)))
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

function parseInvestigationTags(input: string | null | undefined): string[] {
    return String(input || '')
        .split(',')
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return

    try {
        const globalPrescriptionDefaults = await prisma.defaultValue.findFirst({
            where: { clinicId: null, page: 'prescriptions' },
            select: { values: true },
        })
        const allowKeywordLearning = (globalPrescriptionDefaults?.values as any)?.allowKeywordLearning !== false

        if (!allowKeywordLearning) {
            return res.status(200).json({ updated: 0, diagnosesProcessed: 0, disabled: true })
        }

        const diagnoses = Array.isArray(req.body?.diagnoses) ? req.body.diagnoses : []
        const complaintsRaw = Array.isArray(req.body?.complaints) ? req.body.complaints : []
        const investigationsRaw = Array.isArray(req.body?.investigations) ? req.body.investigations : []

        const selectedDiagnoses = diagnoses
            .map((d: any) => String(d || '').trim())
            .filter(Boolean)
        const complaintTags = parseComplaintTags(complaintsRaw.join(','))
        const investigationTags = parseInvestigationTags(investigationsRaw.join(','))
        const learnedTags = Array.from(new Set([...complaintTags, ...investigationTags]))
        const investigationSet = new Set(investigationTags)

        if (selectedDiagnoses.length === 0 || learnedTags.length === 0) {
            return res.status(200).json({ updated: 0, diagnosesProcessed: 0 })
        }

        const treatments = await prisma.treatment.findMany({
            where: {
                AND: [
                    {
                        OR: selectedDiagnoses.map((d: string) => ({
                            provDiagnosis: { equals: d, mode: 'insensitive' as const },
                        })),
                    },
                    { OR: [{ deleted: false }, { deleted: null }] },
                ],
            },
            select: {
                id: true,
                provDiagnosis: true,
                notes: true,
                keywords: true,
            },
        })

        const grouped = new Map<string, typeof treatments>()
        selectedDiagnoses.forEach((d: string) => grouped.set(d, []))
        treatments.forEach((t: any) => {
            const key = String(t.provDiagnosis || '').trim()
            if (!key) return
            if (!grouped.has(key)) grouped.set(key, [])
            grouped.get(key)!.push(t)
        })

        let updated = 0
        for (const [diagnosis, plans] of grouped) {
            if (!plans.length) continue

            const merged = mergeKeywords(
                plans.flatMap((p: any) => {
                    const fromJson = normalizeTreatmentKeywords(p.keywords)
                    const fromNotes = parseTreatmentKeywordsFromNotes(p.notes)
                    return fromJson.length > 0 ? fromJson : fromNotes
                })
            )
            const existingWords = new Set(merged.map((k) => k.word.toLowerCase()))
            const missing = learnedTags.filter((c) => !existingWords.has(c.toLowerCase()))
            if (missing.length === 0) continue

            for (const plan of plans) {
                const current = normalizeTreatmentKeywords(plan.keywords)
                const base = current.length > 0 ? current : parseTreatmentKeywordsFromNotes(plan.notes)
                const extended = mergeKeywords([
                    ...base,
                    ...missing.map((m) => ({
                        word: m.toLowerCase(),
                        weight: investigationSet.has(m.toLowerCase()) ? 2 : 1,
                    })),
                ])

                await prisma.treatment.update({
                    where: { id: plan.id },
                    data: {
                        keywords: extended as any,
                        notes: appendNotesKeywords(plan.notes, missing),
                    },
                })
                updated += 1
            }
        }

        return res.status(200).json({
            updated,
            diagnosesProcessed: grouped.size,
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
