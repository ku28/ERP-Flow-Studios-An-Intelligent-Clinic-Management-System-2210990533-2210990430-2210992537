import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../../lib/auth'

/** Normalise a full-name string for comparison: lower-case, collapse whitespace */
function normaliseName(name: string | undefined | null): string {
    if (!name) return ''
    return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Return YYYY-MM-DD for a Date or date-string, or '' if invalid */
function dateKey(value: any): string {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Require authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return

    try {
        // Expect array of { name?, phone?, email?, dob?, index }
        const { patients } = req.body as {
            patients: Array<{
                name?: string
                phone?: string
                email?: string
                dob?: string
                index: number
            }>
        }

        if (!patients || !Array.isArray(patients)) {
            return res.status(400).json({ error: 'Invalid request body' })
        }

        // Get clinic filter
        const clinicId = getClinicIdFromUser(user)
        const whereClause: any = {}
        if (clinicId) whereClause.clinicId = clinicId

        // Collect all searchable identifiers from the imported rows
        // Only include emails that are real strings (not Excel numeric leakage)
        const emails  = patients.filter(p => p.email && typeof p.email === 'string').map(p => p.email!)
        // Only include DOBs that parse to a realistic date (between 1900 and today)
        const minValidDate = new Date('1900-01-01')
        const maxValidDate = new Date()
        const dobDates = patients
            .filter(p => p.dob)
            .map(p => new Date(p.dob!))
            .filter(d => !isNaN(d.getTime()) && d >= minValidDate && d <= maxValidDate)

        // Broad batch query: fetch any existing patient that shares an email or dob
        const orClauses: any[] = []
        if (emails.length  > 0) orClauses.push({ email: { in: emails } })
        if (dobDates.length > 0) orClauses.push({ dob: { in: dobDates } })

        let existingPatients: Array<{ fullName: string | null; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; dob: Date | null }> = []

        if (orClauses.length > 0) {
            existingPatients = await prisma.patient.findMany({
                where: { ...whereClause, OR: orClauses },
                select: { fullName: true, firstName: true, lastName: true, phone: true, email: true, dob: true }
            })
        }

        // Helper to get the best display name from a DB record
        const getDbName = (p: any) =>
            normaliseName(p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim())

        // Pre-build lookup maps for O(1) access
        const existingEmails = new Set(existingPatients.map((p: any) => p.email).filter(Boolean))

        // Map of "normalisedName|YYYY-MM-DD" → true  (for name+dob check)
        // Only include records where the name is non-empty to avoid false positives
        // when firstName was stored as empty string
        const existingNameDob = new Set(
            existingPatients
                .filter((p: any) => p.dob && getDbName(p))
                .map((p: any) => `${getDbName(p)}|${dateKey(p.dob)}`)
        )

        // Map of normalisedExistingName → { email }  (for name+email check)
        const existingByName: Map<string, { email: string | null }[]> = new Map()
        existingPatients.forEach((p: any) => {
            const key = getDbName(p)
            if (!key) return // skip records with no name
            if (!existingByName.has(key)) existingByName.set(key, [])
            existingByName.get(key)!.push({ email: p.email })
        })

        /**
         * Duplicate detection (phone is intentionally excluded):
         * 1. Name + email → duplicate
         * 2. Name + dob  → duplicate
         * 3. Email alone (globally unique field) → duplicate
         */
        const duplicateIndices: number[] = []
        const uniqueIndices: number[] = []

        patients.forEach(patient => {
            const importedName  = normaliseName(patient.name)
            const importedDob   = dateKey(patient.dob)
            let isDuplicate = false

            // --- 1. Name-first checks ---
            if (importedName) {
                const byName = existingByName.get(importedName) || []

                // 1a. Name + email
                if (patient.email && byName.some(e => e.email === patient.email)) {
                    isDuplicate = true
                }
                // 1b. Name + dob — only when both the imported name and at least one
                // existing record name are non-empty (avoids empty-string false matches)
                if (!isDuplicate && importedDob && importedName) {
                    isDuplicate = existingNameDob.has(`${importedName}|${importedDob}`)
                }
            }

            // --- 2. Email alone (globally unique field) ---
            if (!isDuplicate && patient.email && existingEmails.has(patient.email)) {
                isDuplicate = true
            }

            if (isDuplicate) {
                duplicateIndices.push(patient.index)
            } else {
                uniqueIndices.push(patient.index)
            }
        })

        return res.status(200).json({ duplicateIndices, uniqueIndices })
    } catch (error: any) {
        return res.status(500).json({ error: 'Internal server error', details: error.message })
    }
}
