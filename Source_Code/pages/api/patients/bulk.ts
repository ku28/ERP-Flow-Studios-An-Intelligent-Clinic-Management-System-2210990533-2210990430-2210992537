import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../../lib/auth'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        // Require authentication for multi-tenant isolation
        const user = await requireAuth(req, res)
        if (!user) return
        
        // Get clinicId for multi-tenant isolation - MUST be set for non-super_admin
        let clinicId: string | null = null
        
        if (user.role === 'super_admin') {
            clinicId = null // Super admin can create without clinic
        } else {
            clinicId = user.clinicId || user.clinic?.id || null
            
            if (!clinicId) {
                return res.status(403).json({ error: 'No clinic association. Cannot import patients.' })
            }
        }
        
        
        // Bulk create patients
        const { patients } = req.body

        if (!Array.isArray(patients) || patients.length === 0) {
            return res.status(400).json({ error: 'Invalid patients array' })
        }


        try {
            // Process in controlled batches to avoid connection pool exhaustion
            const BATCH_SIZE = 50
            const CONCURRENCY_LIMIT = 4 // Reduced to limit concurrent email-unique races
            const results: any[] = []
            const errors: any[] = []

            // Deduplicate within the incoming batch by email (keep first occurrence).
            // This prevents concurrent P2002 unique-constraint races when the same
            // email appears multiple times in one import file.
            const seenEmails = new Set<string>()
            const dedupedPatients = patients.filter((p: any) => {
                const em = typeof p.email === 'string' ? p.email.trim().toLowerCase() : null
                if (em) {
                    if (seenEmails.has(em)) return false
                    seenEmails.add(em)
                }
                return true
            })
            
            const chunks = []
            for (let i = 0; i < dedupedPatients.length; i += BATCH_SIZE) {
                chunks.push(dedupedPatients.slice(i, i + BATCH_SIZE))
            }

            for (const chunk of chunks) {
                // Process chunk in smaller concurrent batches
                for (let i = 0; i < chunk.length; i += CONCURRENCY_LIMIT) {
                    const concurrentBatch = chunk.slice(i, i + CONCURRENCY_LIMIT)
                    
                    const chunkPromises = concurrentBatch.map(async (patientData: any) => {
                    try {
                        const { 
                            firstName, lastName, fullName, phone, email, date, dob, age, 
                            address, gender, fatherHusbandGuardianName,
                            weight, height, doctorId,
                            temperament, pulseDiagnosis, pulseDiagnosis2,
                            majorComplaints, historyReports, investigations,
                            provisionalDiagnosis, improvements, nextVisit, imageUrl
                        } = patientData

                        // Resolve the canonical full name — the import file may send only
                        // fullName (single column) or legacy firstName/lastName
                        const resolvedFullName = (fullName || `${firstName || ''} ${lastName || ''}`.trim()) || null
                        const resolvedFirstName = resolvedFullName  // kept for backward-compat with other pages

                        // Helper function to validate and parse dates
                        // Handles DD-MM-YYYY, MM/DD/YYYY, ISO formats
                        const parseValidDate = (dateValue: any) => {
                            if (!dateValue) return null
                            
                            const dateStr = String(dateValue).trim()
                            if (!dateStr) return null
                            
                            // Try DD-MM-YYYY format first (common in forms)
                            if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
                                const [day, month, year] = dateStr.split('-').map(Number)
                                const parsed = new Date(year, month - 1, day)
                                return isNaN(parsed.getTime()) ? null : parsed
                            }
                            
                            // Try DD/MM/YYYY format
                            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                                const [day, month, year] = dateStr.split('/').map(Number)
                                const parsed = new Date(year, month - 1, day)
                                return isNaN(parsed.getTime()) ? null : parsed
                            }
                            
                            // Try standard Date parsing for ISO formats
                            const parsed = new Date(dateValue)
                            return isNaN(parsed.getTime()) ? null : parsed
                        }

                        // Parse dates safely
                        const parsedDate = parseValidDate(date)
                        const parsedDob = parseValidDate(dob)
                        const parsedNextVisit = parseValidDate(nextVisit)

                        // IMPORT STRATEGY: Every row in an import file is a distinct patient.
                        // Phone is NOT a unique identifier — family members share phones.
                        // We only match by email when present (email is a personal identifier).
                        // Never match by phone: that would silently overwrite a different family
                        // member who happens to share the same contact number.
                        let existingPatient = null
                        const existingWhere: any = {}
                        
                        if (clinicId) {
                            existingWhere.clinicId = clinicId
                        }
                        
                        if (email) {
                            existingPatient = await prisma.patient.findFirst({
                                where: { ...existingWhere, email }
                            })
                        }

                        if (existingPatient) {
                            // Update existing patient
                            return await prisma.patient.update({
                                where: { id: existingPatient.id },
                                data: {
                                    fullName: resolvedFullName || undefined,
                                    firstName: resolvedFirstName || undefined,
                                    lastName: lastName || undefined,
                                    phone: phone || existingPatient.phone,
                                    email: email || existingPatient.email,
                                    date: parsedDate || existingPatient.date,
                                    dob: parsedDob || existingPatient.dob,
                                    age: age ? Number(age) : existingPatient.age,
                                    address: address || existingPatient.address,
                                    gender: gender || existingPatient.gender,
                                    fatherHusbandGuardianName: fatherHusbandGuardianName || existingPatient.fatherHusbandGuardianName,
                                    weight: weight != null ? Number(weight) : existingPatient.weight,
                                    height: height != null ? Number(height) : existingPatient.height,
                                    temperament: temperament || existingPatient.temperament,
                                    pulseDiagnosis: pulseDiagnosis || existingPatient.pulseDiagnosis,
                                    pulseDiagnosis2: pulseDiagnosis2 || existingPatient.pulseDiagnosis2,
                                    majorComplaints: majorComplaints || existingPatient.majorComplaints,
                                    historyReports: historyReports || existingPatient.historyReports,
                                    investigations: investigations || existingPatient.investigations,
                                    provisionalDiagnosis: provisionalDiagnosis || existingPatient.provisionalDiagnosis,
                                    improvements: improvements || existingPatient.improvements,
                                    nextVisit: parsedNextVisit || existingPatient.nextVisit,
                                    imageUrl: imageUrl || existingPatient.imageUrl,
                                    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
                                }
                            })
                        } else {
                            // Create new patient with clinicId
                            return await prisma.patient.create({
                                data: {
                                    fullName: resolvedFullName,
                                    firstName: resolvedFirstName,
                                    lastName: lastName || null,
                                    phone: phone || null,
                                    email: email || null,
                                    date: parsedDate,
                                    dob: parsedDob,
                                    age: age ? Number(age) : null,
                                    address: address || null,
                                    gender: gender || null,
                                    fatherHusbandGuardianName: fatherHusbandGuardianName || null,
                                    weight: weight != null ? Number(weight) : null,
                                    height: height != null ? Number(height) : null,
                                    temperament: temperament || null,
                                    pulseDiagnosis: pulseDiagnosis || null,
                                    pulseDiagnosis2: pulseDiagnosis2 || null,
                                    majorComplaints: majorComplaints || null,
                                    historyReports: historyReports || null,
                                    investigations: investigations || null,
                                    provisionalDiagnosis: provisionalDiagnosis || null,
                                    improvements: improvements || null,
                                    nextVisit: parsedNextVisit,
                                    imageUrl: imageUrl || null,
                                    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
                                    clinicId: clinicId || undefined
                                }
                            })
                        }
                    } catch (err: any) {
                        // P2002 = unique constraint violation on email
                        // This can happen due to concurrent batch processing (race condition)
                        // or cross-clinic email collision. Recover by finding the conflicting
                        // record and either updating (same clinic) or creating without email.
                        if (err?.code === 'P2002') {
                            try {
                                const conflicting = await prisma.patient.findFirst({
                                    where: { email: patientData.email }
                                })
                                if (conflicting) {
                                    if (conflicting.clinicId === clinicId) {
                                        // Same clinic — it was just created concurrently, update it
                                        return await prisma.patient.update({
                                            where: { id: conflicting.id },
                                            data: {
                                                firstName: patientData.firstName,
                                                lastName: patientData.lastName,
                                                fullName: patientData.fullName || `${patientData.firstName || ''} ${patientData.lastName || ''}`.trim() || undefined,
                                                phone: patientData.phone || conflicting.phone,
                                            }
                                        })
                                    } else {
                                        // Different clinic — create without email to avoid conflict
                                        return await prisma.patient.create({
                                            data: {
                                                firstName: patientData.firstName,
                                                lastName: patientData.lastName,
                                                fullName: patientData.fullName || null,
                                                phone: patientData.phone || null,
                                                email: null,
                                                date: (() => { const d = String(patientData.date || '').trim(); if (/^\d{2}-\d{2}-\d{4}$/.test(d)) { const [dy,mo,yr] = d.split('-').map(Number); const p = new Date(yr,mo-1,dy); return isNaN(p.getTime()) ? null : p } if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dy,mo,yr] = d.split('/').map(Number); const p = new Date(yr,mo-1,dy); return isNaN(p.getTime()) ? null : p } const p = new Date(patientData.date); return isNaN(p.getTime()) ? null : p })(),
                                                dob: (() => { const d = String(patientData.dob || '').trim(); if (/^\d{2}-\d{2}-\d{4}$/.test(d)) { const [dy,mo,yr] = d.split('-').map(Number); const p = new Date(yr,mo-1,dy); return isNaN(p.getTime()) ? null : p } if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dy,mo,yr] = d.split('/').map(Number); const p = new Date(yr,mo-1,dy); return isNaN(p.getTime()) ? null : p } const p = new Date(patientData.dob); return isNaN(p.getTime()) ? null : p })(),
                                                age: patientData.age ? Number(patientData.age) : null,
                                                address: patientData.address || null,
                                                gender: patientData.gender || null,
                                                fatherHusbandGuardianName: patientData.fatherHusbandGuardianName || null,
                                                weight: patientData.weight != null ? Number(patientData.weight) : null,
                                                height: patientData.height != null ? Number(patientData.height) : null,
                                                ...(patientData.doctorId ? { doctorId: Number(patientData.doctorId) } : {}),
                                                clinicId: clinicId || undefined
                                            }
                                        })
                                    }
                                }
                            } catch {
                                // If recovery also fails, fall through to error
                            }
                        }
                        errors.push({
                            patient: `${patientData.firstName || ''} ${patientData.lastName || ''}`.trim() || 'Unknown',
                            error: err.message
                        })
                        return null
                    }
                })

                const chunkResults = await Promise.all(chunkPromises)
                results.push(...chunkResults.filter(r => r !== null))
                
                // Small delay to allow connection pool to recover
                await new Promise(resolve => setTimeout(resolve, 50))
                }
            }


            return res.status(201).json({ 
                success: true, 
                count: results.length,
                errors: errors.length > 0 ? errors : undefined,
                message: errors.length > 0 
                    ? `Imported ${results.length} patients with ${errors.length} errors` 
                    : `Successfully imported ${results.length} patients`
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Failed to import patients' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}

export default handler
