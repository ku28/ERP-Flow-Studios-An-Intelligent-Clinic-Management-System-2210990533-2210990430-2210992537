import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../../lib/auth'
import { getDoctorIdForCreate } from '../../../lib/doctorUtils'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        // Get clinicId for multi-tenant isolation
        const clinicId = getClinicIdFromUser(user)
        if (!clinicId && user.role !== 'super_admin') {
            return res.status(403).json({ error: 'No clinic association' })
        }

        const { visits, doctorId: requestDoctorId } = req.body

        if (!Array.isArray(visits) || visits.length === 0) {
            return res.status(400).json({ error: 'Invalid visits array' })
        }

        // Get the effective doctorId (doctor's own ID, or admin's selected doctor)
        const doctorId = getDoctorIdForCreate(user, requestDoctorId)


        // Helper function to safely parse dates
        const parseDate = (dateStr: any): Date | null => {
            if (!dateStr) return null

            try {
                let dateString = String(dateStr).trim()

                // Try date string patterns - DD-MM-YYYY format
                let match = dateString.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
                if (match) {
                    const [, day, month, year] = match
                    const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                    if (!isNaN(parsedDate.getTime())) {
                        return parsedDate
                    }
                }

                // If it's a pure number (Excel serial), return null
                const numValue = parseFloat(dateString)
                if (!isNaN(numValue) && !/[\/-]/.test(dateString)) {
                    return null
                }

                // Pattern 2: MM/DD/YYYY
                match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
                if (match) {
                    const [, month, day, year] = match
                    const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                    if (!isNaN(parsedDate.getTime())) {
                        return parsedDate
                    }
                }

                // Pattern 3: Try standard Date parsing as fallback
                const date = new Date(dateString)
                if (!isNaN(date.getTime())) {
                    return date
                }

                return null
            } catch (error) {
                return null
            }
        }

        // Helper function to safely convert to string or null
        const toString = (value: any): string | null => {
            if (value === null || value === undefined || value === '' || value === 0) return null
            if (typeof value === 'string') {
                const trimmed = value.trim()
                // Treat "0" as empty
                if (trimmed === '0' || trimmed === '') return null
                return trimmed
            }
            // If it's a number or other type, try to convert but if it looks invalid, return null
            try {
                const str = String(value).trim()
                // Treat "0" as empty
                if (str === '0' || str === '') return null
                // Check if it looks like a malformed number (e.g., Excel date serial)
                if (typeof value === 'number' && (value > 1000000 || value < -1000000)) {
                    return null
                }
                return str
            } catch {
                return null
            }
        }

        // Helper function to safely parse numbers
        const toNumber = (value: any): number | null => {
            if (value === null || value === undefined || value === '' || value === 0) return null

            // Handle weight history format like "69/70/71" - take the last value
            if (typeof value === 'string' && value.includes('/')) {
                const values = value.split('/').map(v => v.trim()).filter(v => v && v !== '0')
                if (values.length > 0) {
                    const lastValue = values[values.length - 1]
                    const num = Number(lastValue)
                    return isNaN(num) || num === 0 ? null : num
                }
                return null
            }

            const num = Number(value)
            if (isNaN(num) || num === 0) return null
            return num
        }

        // Helper to parse weight with history (e.g., "95/94/94/94/95/94/92/93/91/94")
        const parseWeight = (value: any): number | null => {
            if (value === null || value === undefined || value === '' || value === 0) return null

            const str = String(value).trim()
            if (!str || str === '0') return null

            // Handle weight history format like "95/94/94/94/95/94/92/93/91/94" - take the last value
            if (str.includes('/')) {
                const values = str.split('/').map(v => v.trim()).filter(v => v && v !== '0')
                if (values.length > 0) {
                    const lastValue = values[values.length - 1]
                    const num = Number(lastValue)
                    return isNaN(num) || num === 0 ? null : num
                }
                return null
            }

            const num = Number(str)
            return isNaN(num) || num === 0 ? null : num
        }

        // Helper to extract weight history as string
        const parseWeightHistory = (value: any): string | null => {
            if (value === null || value === undefined || value === '' || value === 0) return null
            const str = String(value).trim()
            if (!str || str === '0') return null
            // If it contains "/" it's a history, otherwise just return the value
            return str || null
        }

        // Helper to parse height in format like "3' 9"" or "5'10"" to inches
        const parseHeight = (value: any): number | null => {
            if (value === null || value === undefined || value === '' || value === 0) return null

            const str = String(value).trim()
            if (!str || str === '0') return null

            // Try to parse format like "3' 9"" or "5'10""
            const heightMatch = str.match(/(\d+)'?\s*(\d+)?/)
            if (heightMatch) {
                const feet = parseInt(heightMatch[1]) || 0
                const inches = parseInt(heightMatch[2]) || 0
                const totalInches = (feet * 12) + inches
                return totalInches > 0 ? totalInches : null
            }

            // Try direct number
            const num = Number(str)
            if (isNaN(num) || num === 0) return null
            return num
        }

        // Helper to parse age from formats like "30 YR", "25YR", "5 MONTHS", etc.
        const parseAge = (value: any): number | null => {
            if (value === null || value === undefined || value === '' || value === 0) return null

            const str = String(value).trim().toUpperCase()
            if (!str || str === '0' || str === 'YR' || str === 'YEARS' || str === 'Y') return null

            // Match patterns like "30 YR", "25YR", "5 MONTHS", "2 M", etc.
            const ageMatch = str.match(/(\d+)\s*(YR|YEARS?|Y|M|MONTHS?)?/)
            if (ageMatch) {
                const num = parseInt(ageMatch[1])
                if (num === 0) return null
                
                const unit = ageMatch[2]

                // If unit is months or M, convert to years (but return null if less than 1 year for DOB calculation)
                if (unit && (unit.startsWith('M') || unit === 'MONTHS')) {
                    // Store months as decimal years for accuracy
                    return num / 12
                }

                return num > 0 ? num : null
            }

            // Try direct number
            const num = Number(str)
            if (isNaN(num) || num === 0) return null
            return num
        }

        // Helper to calculate DOB from age
        const calculateDobFromAge = (age: number): Date => {
            const today = new Date()
            const birthYear = today.getFullYear() - Math.floor(age)
            return new Date(birthYear, today.getMonth(), today.getDate())
        }

        // Helper to calculate age from DOB
        const calculateAgeFromDob = (dob: Date): number => {
            const today = new Date()
            let age = today.getFullYear() - dob.getFullYear()
            const monthDiff = today.getMonth() - dob.getMonth()

            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                age--
            }

            return age
        }

        // Helper to normalize phone numbers (remove spaces, dashes, parentheses, etc.)
        const normalizePhone = (phone: any): string | null => {
            if (!phone) return null
            const phoneStr = String(phone).trim()
            if (!phoneStr) return null
            // Remove all non-digit characters
            const normalized = phoneStr.replace(/\D/g, '')
            return normalized.length > 0 ? normalized : null
        }

        // Helper function to calculate Levenshtein distance (for spelling mistake tolerance)
        const levenshteinDistance = (str1: string, str2: string): number => {
            const m = str1.length
            const n = str2.length
            const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

            for (let i = 0; i <= m; i++) dp[i][0] = i
            for (let j = 0; j <= n; j++) dp[0][j] = j

            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    if (str1[i - 1] === str2[j - 1]) {
                        dp[i][j] = dp[i - 1][j - 1]
                    } else {
                        dp[i][j] = Math.min(
                            dp[i - 1][j] + 1,    // deletion
                            dp[i][j - 1] + 1,    // insertion
                            dp[i - 1][j - 1] + 1 // substitution
                        )
                    }
                }
            }

            return dp[m][n]
        }

        // Smart fuzzy product matching function
        const findMatchingProduct = (productName: string, productMap: Map<string, any>): any => {
            // Normalize the input product name
            const normalizedInput = productName
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^\w\s]/g, '')

            // Step 1: Try exact match
            if (productMap.has(normalizedInput)) {
                return productMap.get(normalizedInput)
            }

            // Step 2: Check for prefix/suffix variations (e.g., "DRP APIZYME" vs "DRP APIZYME 30")
            // This handles cases where imported name differs by trailing numbers or words
            for (const [existingName, product] of productMap.entries()) {
                // Check if imported name is a prefix of an existing product (min 5 chars to avoid false matches)
                if (normalizedInput.length >= 5 && existingName.startsWith(normalizedInput)) {
                    // Make sure the next character is a space or digit (to avoid partial word matches)
                    const nextChar = existingName[normalizedInput.length]
                    if (!nextChar || nextChar === ' ' || /\d/.test(nextChar)) {
                        return product
                    }
                }
                
                // Check if existing product name is a prefix of imported name
                if (existingName.length >= 5 && normalizedInput.startsWith(existingName)) {
                    const nextChar = normalizedInput[existingName.length]
                    if (!nextChar || nextChar === ' ' || /\d/.test(nextChar)) {
                        return product
                    }
                }
            }

            // Step 3: Try partial match starting from the last word
            const inputWords = normalizedInput.split(' ')
            
            // Start from the last word and work backwards
            for (let i = inputWords.length - 1; i >= 0; i--) {
                const partialName = inputWords.slice(i).join(' ')
                
                // Check if any existing product ends with this partial name
                for (const [existingName, product] of productMap.entries()) {
                    if (existingName.endsWith(partialName) && partialName.length >= 3) {
                        return product
                    }
                }
            }

            // Step 4: Try fuzzy matching with spelling mistake tolerance
            const SIMILARITY_THRESHOLD = 0.85 // 85% similarity required
            let bestMatch: any = null
            let bestSimilarity = 0

            for (const [existingName, product] of productMap.entries()) {
                // Calculate similarity as 1 - (distance / max_length)
                const maxLength = Math.max(normalizedInput.length, existingName.length)
                const distance = levenshteinDistance(normalizedInput, existingName)
                const similarity = 1 - (distance / maxLength)

                if (similarity > bestSimilarity && similarity >= SIMILARITY_THRESHOLD) {
                    bestSimilarity = similarity
                    bestMatch = product
                }

                // Also check if one name contains the other (for compound names)
                if (normalizedInput.length >= 4 && existingName.includes(normalizedInput)) {
                    const containsSimilarity = normalizedInput.length / existingName.length
                    if (containsSimilarity >= 0.6 && containsSimilarity > bestSimilarity) {
                        bestSimilarity = containsSimilarity
                        bestMatch = product
                    }
                }
                
                if (existingName.length >= 4 && normalizedInput.includes(existingName)) {
                    const containsSimilarity = existingName.length / normalizedInput.length
                    if (containsSimilarity >= 0.6 && containsSimilarity > bestSimilarity) {
                        bestSimilarity = containsSimilarity
                        bestMatch = product
                    }
                }
            }

            if (bestMatch) {
                return bestMatch
            }

            return null
        }

        try {
            const BATCH_SIZE = 100 // Increased from 50 for better performance
            const results: any[] = []
            const errors: any[] = []

            // ============ STEP 1: Sort all visits by visit number globally ============
            // Sort ALL visits by visit number to ensure visit #1 comes first
            visits.sort((a: any, b: any) => {
                const aNum = toNumber(a.visitNumber) || 999
                const bNum = toNumber(b.visitNumber) || 999
                return aNum - bNum
            })

            // ============ STEP 2: Group visits by patient ============

            // Normalize patient name for consistent matching
            const normalizePatientName = (name: string): string => {
                return name
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .replace(/[^\w\s]/g, '')
            }

            // Group visits by normalized patient identifier (name as primary key)
            const patientGroups = new Map<string, any[]>()

            visits.forEach((visit: any) => {
                const normalizedName = visit.patientName ? normalizePatientName(visit.patientName) : null

                // Use name strictly as primary key, fallback to opdNo only if no name
                const patientKey = normalizedName || `unknown_${visit.opdNo}`

                if (!patientGroups.has(patientKey)) {
                    patientGroups.set(patientKey, [])
                }
                patientGroups.get(patientKey)!.push(visit)
            })


            // ============ STEP 3: Pre-fetch all data ============

            const productNames = [...new Set(
                visits.flatMap((v: any) => (v.prescriptions || []).map((p: any) => p.productName).filter(Boolean))
            )]

            // Fetch all existing patients in this clinic
            const existingPatientsByPhone = await prisma.patient.findMany({
                where: clinicId ? {
                    clinicId: clinicId
                } : {
                    doctorId: doctorId
                }
            })

            // Build maps with normalized phone numbers
            const patientPhoneMap = new Map(
                existingPatientsByPhone
                    .filter((p: any) => p.phone)
                    .map((p: any) => [normalizePhone(p.phone), p])
            )

            // Build name map: normalize full name consistently
            const patientNameMap = new Map()
            existingPatientsByPhone.forEach((p: any) => {
                const fullName = `${p.firstName} ${p.lastName || ''}`
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .replace(/[^\w\s]/g, '')
                if (fullName) {
                    patientNameMap.set(fullName, p)
                }
            })

            // Fetch all existing products in one query (for this doctor only)
            const existingProducts = await prisma.product.findMany({
                where: {
                    doctorId: doctorId,
                    name: { in: productNames }
                }
            })

            const productNameMap = new Map<string, any>(existingProducts.map((p: any) => [
                p.name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, ''),
                p
            ]))

            // Fetch all existing visits by opdNo in one query
            const opdNos = visits.map((v: any) => v.opdNo).filter(Boolean)
            const existingVisits = await prisma.visit.findMany({
                where: { opdNo: { in: opdNos } }
            })
            const visitOpdMap = new Map(existingVisits.map((v: any) => [v.opdNo, v]))

            // Find or create dummy treatment once for all imports
            let dummyTreatment = await prisma.treatment.findFirst({
                where: {
                    provDiagnosis: 'IMPORTED',
                    planNumber: '00'
                }
            })

            if (!dummyTreatment) {
                dummyTreatment = await prisma.treatment.create({
                    data: {
                        provDiagnosis: 'IMPORTED',
                        planNumber: '00',
                        treatmentPlan: 'IMPORTED PRESCRIPTIONS',
                        notes: 'Auto-created treatment for bulk imported prescriptions'
                    }
                })
            }

            // ============ STEP 3: Process each patient group ============
            // Process groups in batches to avoid overwhelming the system
            const patientGroupArray = Array.from(patientGroups.entries())

            for (const [patientKey, visitsForPatient] of patientGroupArray) {
                
                // Find or create patient from visit #1
                let patient = null
                const firstVisit = visitsForPatient[0] // Already sorted by visit number
                const firstVisitNumber = toNumber(firstVisit.visitNumber) || 1

                const normalizedPhone = normalizePhone(firstVisit.phone)
                const normalizedName = firstVisit.patientName ? normalizePatientName(firstVisit.patientName) : null

                // Try to find existing patient by name only (not by phone to avoid confusion)
                if (normalizedName && patientNameMap.has(normalizedName)) {
                    patient = patientNameMap.get(normalizedName)
                }

                // If patient doesn't exist, create them from the first available visit
                if (!patient) {
                    // Use the first visit in the sorted list (which might not be visit #1)
                    const visitForPatientCreation = visitsForPatient[0]

                    // Create patient from first visit data
                    const nameParts = (visitForPatientCreation.patientName || 'Unknown Patient').trim().split(/\s+/)
                    const firstName = nameParts[0]
                    const lastName = nameParts.slice(1).join(' ') || null
                    

                    let finalDob: Date | null = parseDate(visitForPatientCreation.dob)
                    let finalAge: number | null = parseAge(visitForPatientCreation.age)

                    if (finalDob) {
                        finalAge = calculateAgeFromDob(finalDob)
                    } else if (finalAge && finalAge > 0) {
                        finalDob = calculateDobFromAge(finalAge)
                    }

                    const visitDate = parseDate(visitForPatientCreation.date) || new Date()

                    patient = await prisma.patient.create({
                        data: {
                            firstName: firstName,
                            lastName: lastName,
                            phone: visitForPatientCreation.phone || null,
                            address: visitForPatientCreation.address || null,
                            fatherHusbandGuardianName: visitForPatientCreation.fatherHusbandGuardianName || null,
                            gender: visitForPatientCreation.gender || null,
                            dob: finalDob,
                            age: finalAge,
                            weight: parseWeight(visitForPatientCreation.weight),
                            height: parseHeight(visitForPatientCreation.height),
                            doctorId: doctorId,
                            date: visitDate,
                            createdAt: visitDate // Set creation date to first visit date
                        }
                    })

                    // Add to maps for future lookups
                    if (normalizedPhone) {
                        patientPhoneMap.set(normalizedPhone, patient)
                    }
                    if (normalizedName) {
                        patientNameMap.set(normalizedName, patient)
                    }
                }

                // Now process all visits for this patient
                for (const visitData of visitsForPatient) {
                    try {
                        const {
                            opdNo,
                            patientName,
                            phone,
                            date,
                            prescriptions,
                            discount,
                            payment,
                            procedureAdopted,
                            discussion,
                            extra,
                            ...visitFields
                        } = visitData

                        // Check if visit with this opdNo already exists
                        const existingVisit: any = visitOpdMap.get(opdNo)

                        let visit
                        if (existingVisit) {
                            // Parse DOB and age with priority: DOB first, then calculate age from it
                            let finalDob: Date | null = parseDate(visitFields.dob)
                            let finalAge: number | null = parseAge(visitFields.age)

                            if (finalDob) {
                                finalAge = calculateAgeFromDob(finalDob)
                            } else if (finalAge && finalAge > 0) {
                                finalDob = calculateDobFromAge(finalAge)
                            }

                            // Update existing visit
                            visit = await prisma.visit.update({
                                where: { id: existingVisit.id },
                                data: {
                                    patient: {
                                        connect: { id: patient.id }
                                    },
                                    opdNo: opdNo,
                                    date: parseDate(date) || new Date(),
                                    visitNumber: toNumber(visitFields.visitNumber),
                                    provisionalDiagnosis: toString(visitFields.provDiagnosis),
                                    temperament: toString(visitFields.temperament),
                                    pulseDiagnosis: toString(visitFields.pulseDiagnosis),
                                    pulseDiagnosis2: toString(visitFields.pulseDiagnosis2),
                                    majorComplaints: toString(visitFields.majorComplaints),
                                    historyReports: toString(visitFields.historyReports),
                                    investigations: toString(visitFields.investigations),
                                    improvements: toString(visitFields.improvements),
                                    nextVisit: parseDate(visitFields.nextVisit),
                                    amount: toNumber(visitFields.amount),
                                    discount: toNumber(discount),
                                    payment: toNumber(payment),
                                    balance: toNumber(visitFields.balance),
                                    followUpCount: toNumber(visitFields.followUpCount),
                                    address: toString(visitFields.address),
                                    phone: toString(phone),
                                    gender: toString(visitFields.gender),
                                    dob: finalDob,
                                    age: finalAge,
                                    weight: parseWeight(visitFields.weight),
                                    height: parseHeight(visitFields.height),
                                    procedureAdopted: toString(procedureAdopted),
                                    discussion: toString(discussion),
                                    extra: (() => {
                                        const weightHistory = parseWeightHistory(visitFields.weight)
                                        if (weightHistory && weightHistory.includes('/')) {
                                            // Store weight history in extra as JSON
                                            try {
                                                const existingExtra = extra ? JSON.parse(extra) : {}
                                                existingExtra.weightHistory = weightHistory
                                                return JSON.stringify(existingExtra)
                                            } catch {
                                                return JSON.stringify({ weightHistory })
                                            }
                                        }
                                        return toString(extra)
                                    })()
                                }
                            })

                            // Delete existing prescriptions for this visit before creating new ones
                            await prisma.prescription.deleteMany({
                                where: { visitId: visit.id }
                            })
                        } else {
                            // Parse DOB and age with priority: DOB first, then calculate age from it
                            let finalDob: Date | null = parseDate(visitFields.dob)
                            let finalAge: number | null = parseAge(visitFields.age)

                            if (finalDob) {
                                finalAge = calculateAgeFromDob(finalDob)
                            } else if (finalAge && finalAge > 0) {
                                finalDob = calculateDobFromAge(finalAge)
                            }

                            // Create new visit
                            visit = await prisma.visit.create({
                                data: {
                                    patient: {
                                        connect: { id: patient.id }
                                    },
                                    doctor: doctorId ? {
                                        connect: { id: doctorId }
                                    } : undefined,
                                    opdNo: opdNo,
                                    date: parseDate(date) || new Date(),
                                    isImported: true, // Mark as imported to skip PDF generation
                                    visitNumber: toNumber(visitFields.visitNumber),
                                    provisionalDiagnosis: toString(visitFields.provDiagnosis),
                                    temperament: toString(visitFields.temperament),
                                    pulseDiagnosis: toString(visitFields.pulseDiagnosis),
                                    pulseDiagnosis2: toString(visitFields.pulseDiagnosis2),
                                    majorComplaints: toString(visitFields.majorComplaints),
                                    historyReports: toString(visitFields.historyReports),
                                    investigations: toString(visitFields.investigations),
                                    improvements: toString(visitFields.improvements),
                                    nextVisit: parseDate(visitFields.nextVisit),
                                    amount: toNumber(visitFields.amount),
                                    discount: toNumber(discount),
                                    payment: toNumber(payment),
                                    balance: toNumber(visitFields.balance),
                                    followUpCount: toNumber(visitFields.followUpCount),
                                    address: toString(visitFields.address),
                                    phone: toString(phone),
                                    gender: toString(visitFields.gender),
                                    dob: finalDob,
                                    age: finalAge,
                                    weight: parseWeight(visitFields.weight),
                                    height: parseHeight(visitFields.height),
                                    procedureAdopted: toString(procedureAdopted),
                                    discussion: toString(discussion),
                                    extra: (() => {
                                        const weightHistory = parseWeightHistory(visitFields.weight)
                                        if (weightHistory && weightHistory.includes('/')) {
                                            // Store weight history in extra as JSON
                                            try {
                                                const existingExtra = extra ? JSON.parse(extra) : {}
                                                existingExtra.weightHistory = weightHistory
                                                return JSON.stringify(existingExtra)
                                            } catch {
                                                return JSON.stringify({ weightHistory })
                                            }
                                        }
                                        return toString(extra)
                                    })()
                                }
                            })
                        }

                        // Create prescriptions if provided - use batch creation for better performance
                        if (prescriptions && Array.isArray(prescriptions) && prescriptions.length > 0) {
                            const prescriptionData = []
                            
                            // Helper function to determine category based on product name
                            const getCategoryFromName = (productName: string): string => {
                                const name = productName.trim().toLowerCase()
                                const words = name.split(/\s+/)
                                
                                // Check if any word is exactly 'drp' or if name starts with 'drp'
                                if (name.startsWith('drp') || words.includes('drp')) {
                                    return 'Drops'
                                }
                                if (name.startsWith('syr') || words.includes('syr')) {
                                    return 'Syrup'
                                }
                                if (name.startsWith('tab') || words.includes('tab')) {
                                    return 'Tablet'
                                }
                                if (name.startsWith('cap') || words.includes('cap')) {
                                    return 'Capsule'
                                }
                                if (name.startsWith('oint') || words.includes('oint')) {
                                    return 'Ointment'
                                }
                                
                                return 'Imported' // Default category
                            }
                            
                            // Pre-fetch or create all needed categories
                            const categoryCache = new Map<string, any>()
                            
                            // Get or create "Imported" category for auto-created products with matching doctorId
                            const getOrCreateCategory = async (categoryName: string) => {
                                if (categoryCache.has(categoryName)) {
                                    return categoryCache.get(categoryName)
                                }
                                
                                let category = await prisma.category.findFirst({
                                    where: {
                                        name: categoryName,
                                        doctorId: doctorId
                                    }
                                })
                                
                                if (!category) {
                                    category = await prisma.category.create({
                                        data: {
                                            name: categoryName,
                                            code: categoryName.toUpperCase(),
                                            reorderLevel: 0,
                                            doctorId: doctorId
                                        }
                                    })
                                }
                                
                                categoryCache.set(categoryName, category)
                                return category
                            }
                            
                            for (const prData of prescriptions) {
                                // Skip prescriptions with no product name or invalid names (0, '0', empty)
                                if (!prData.productName || 
                                    prData.productName === 0 || 
                                    String(prData.productName).trim() === '0' || 
                                    String(prData.productName).trim() === '') {
                                    continue
                                }

                                // Use smart fuzzy matching to find existing product
                                let product: any = findMatchingProduct(prData.productName, productNameMap)

                                // If product not found, create it with appropriate category based on name
                                if (!product) {
                                    // Determine category from product name
                                    const categoryName = getCategoryFromName(prData.productName)
                                    const category = await getOrCreateCategory(categoryName)
                                    
                                    const trimmedProductName = prData.productName.trim()
                                    
                                    product = await prisma.product.create({
                                        data: {
                                            name: trimmedProductName, // Use original name but trimmed
                                            priceRupees: 0,
                                            quantity: 0,
                                            totalPurchased: 100, // Default total purchased for imported products
                                            categoryId: category.id,
                                            doctorId: doctorId
                                        }
                                    })

                                    // Add to map with normalized name for subsequent lookups
                                    const normalizedProductName = trimmedProductName
                                        .toLowerCase()
                                        .replace(/\s+/g, ' ')
                                        .replace(/[^\w\s]/g, '')
                                    productNameMap.set(normalizedProductName, product)
                                }

                                // Add to batch
                                prescriptionData.push({
                                    visitId: visit.id,
                                    productId: product.id,
                                    treatmentId: dummyTreatment.id,
                                    quantity: toNumber(prData.quantity) || 1,
                                    spy1: toString(prData.spy1),
                                    spy2: toString(prData.spy2),
                                    spy3: toString(prData.spy3),
                                    timing: toString(prData.timing),
                                    dosage: toString(prData.dosage),
                                    addition1: toString(prData.addition1),
                                    addition2: toString(prData.addition2),
                                    addition3: toString(prData.addition3),
                                    procedure: toString(prData.procedure),
                                    presentation: toString(prData.presentation),
                                    discussions: toString(prData.discussion || prData.discussions)
                                })
                            }

                            // Batch create all prescriptions at once
                            if (prescriptionData.length > 0) {
                                await prisma.prescription.createMany({
                                    data: prescriptionData
                                })
                            }
                        }

                        results.push({ success: true, opdNo, visitId: visit.id })
                    } catch (err: any) {
                        errors.push({
                            opdNo: visitData.opdNo,
                            error: err.message
                        })
                    }
                }
            }


            return res.status(201).json({
                success: true,
                count: results.length,
                errors: errors.length > 0 ? errors : undefined,
                message: errors.length > 0
                    ? `Imported ${results.length} visits with ${errors.length} errors`
                    : `Successfully imported ${results.length} visits`
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Failed to import visits' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}

export default handler
