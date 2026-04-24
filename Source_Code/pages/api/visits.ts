import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'
import { generateOpdNo } from '../../lib/utils'
import { getDoctorFilter, getDoctorIdForCreate } from '../../lib/doctorUtils'

const SPAGYRIC_CATEGORY_NAME = 'SPAGYRIC'
const SPAGYRIC_SPY_FIELDS = ['spy1', 'spy2', 'spy3', 'spy4', 'spy5', 'spy6'] as const

function parseSpyComponentValue(raw: any): { name: string; drops: number } {
    const value = String(raw || '').trim()
    if (!value) return { name: '', drops: 0 }
    const parts = value.split('|')
    const name = String(parts[0] || '').trim().toUpperCase()
    const dropsRaw = parseFloat(String(parts[1] || '').trim())
    const drops = Number.isFinite(dropsRaw) && dropsRaw > 0 ? dropsRaw : 0
    return { name, drops }
}

function getSpagyricMlUsageByNameFromPrescription(prescription: any): Map<string, number> {
    const usage = new Map<string, number>()
    if (!prescription) return usage

    for (const field of SPAGYRIC_SPY_FIELDS) {
        const { name, drops } = parseSpyComponentValue(prescription[field])
        if (!name || drops <= 0) continue
        const mlToConsume = Math.ceil(drops / 20)
        if (mlToConsume <= 0) continue
        usage.set(name, (usage.get(name) || 0) + mlToConsume)
    }

    return usage
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        try {
            const { id, patientId, limit, offset, includePrescriptions, doctorId: selectedDoctorId } = req.query
            
            // Get clinic filter for multi-tenant isolation
            const clinicId = getClinicIdFromUser(user)
            const baseWhere: any = {}
            
            // Add clinic filter through patient relationship
            if (clinicId) {
                baseWhere.patient = { clinicId }
            }
            
            // If ID is provided, fetch single visit
            if (id) {
                const visit = await prisma.visit.findFirst({
                    where: { 
                        id: Number(id),
                        ...baseWhere
                    },
                    include: {
                        prescriptions: {
                            include: {
                                product: true
                            }
                        },
                        patient: true
                    }
                })
                
                if (!visit) {
                    return res.status(404).json({ error: 'Visit not found or access denied' })
                }
                
                return res.status(200).json(visit)
            }
            
            // If patientId is provided, fetch visits for that patient
            if (patientId) {
                const items = await prisma.visit.findMany({ 
                    where: { 
                        patientId: Number(patientId),
                        ...baseWhere
                    },
                    orderBy: { date: 'desc' },
                    include: {
                        prescriptions: includePrescriptions === 'true' ? {
                            include: {
                                product: true
                            }
                        } : false,
                        patient: true
                    }
                })
                return res.status(200).json(items)
            }
            
            // Otherwise fetch all visits with pagination and minimal data
            const limitNum = limit ? Math.min(Number(limit), 10000) : 100 // Default 100, max 10000
            const offsetNum = offset ? Number(offset) : 0
            
            const items = await prisma.visit.findMany({ 
                where: baseWhere,
                take: limitNum,
                skip: offsetNum,
                orderBy: { date: 'desc' },
                include: {
                    // Only include prescriptions if explicitly requested
                    prescriptions: includePrescriptions === 'true' ? {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    category: true
                                }
                            }
                        }
                    } : false,
                    patient: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                            gender: true,
                            email: true,
                            imageUrl: true
                        }
                    }
                }
            })
            
            // Get total count for pagination with same filter
            const total = await prisma.visit.count({ where: baseWhere })
            
            return res.status(200).json({
                data: items,
                pagination: {
                    total,
                    limit: limitNum,
                    offset: offsetNum,
                    hasMore: offsetNum + limitNum < total
                }
            })
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const user = await requireAuth(req, res)
        if(!user) return
        const {
            id, // If provided, this is an update operation
            patientId,
            opdNo,
            date,
            diagnoses,
            temperament,
            pulseDiagnosis,
            pulseDiagnosis2,
            majorComplaints,
            historyReports,
            investigations,
            provisionalDiagnosis,
            improvements,
            specialNote,
            discussion,
            dob,
            age,
            address,
            gender,
            phone,
            nextVisit,
            occupation,
            pendingPaymentCents,
            overridePendingPayment,
            height,
            weight,
            amount,
            discount,
            payment,
            balance,
            consultationFees,
            visitNumber,
            followUpCount,
            reportsAttachments, // JSON string of report attachments
            officeCopyPdfUrl, // Cloudinary URL for office copy
            prescriptions, // optional array of { treatmentId, dosage, administration, quantity, taken, productId }
            miscProducts, // optional array of MISC products to deplete but not invoice
            autoGenerateInvoice // flag to automatically create customer invoice
        } = req.body

        const isUpdate = !!id
        const clinicId = getClinicIdFromUser(user)
        if (!clinicId) {
            return res.status(403).json({ error: 'No clinic association. Cannot manage visits.' })
        }
        
        // Get the doctor ID before the transaction
        const doctorIdForTask = getDoctorIdForCreate(user, req.body.doctorId)

        // Ensure patient belongs to clinic before create/update
        if (patientId) {
            const clinicPatient = await prisma.patient.findFirst({
                where: { id: Number(patientId), clinicId },
                select: { id: true }
            })
            if (!clinicPatient) {
                return res.status(404).json({ error: 'Patient not found or access denied' })
            }
        }

        // Ensure existing visit belongs to clinic before update
        if (isUpdate) {
            const existingVisit = await prisma.visit.findFirst({
                where: { id: Number(id), patient: { clinicId } },
                select: { id: true }
            })
            if (!existingVisit) {
                return res.status(404).json({ error: 'Visit not found or access denied' })
            }
        }

        // Fetch patient data once before transaction to avoid queries inside
        const patientData = patientId ? await prisma.patient.findFirst({ 
            where: { id: Number(patientId), clinicId },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, date: true, createdAt: true }
        }) : null

        try {
            // Create or update visit, prescriptions, update inventory, and optionally create invoice - all in one transaction
            const result = await prisma.$transaction(async (tx: any) => {
                // Auto-generate opdNo if creating a new visit
                let generatedOpdNo = opdNo
                if (!isUpdate && !opdNo) {
                    // Get visit count for this patient
                    const visitCount = await tx.visit.count({
                        where: { patientId: Number(patientId) }
                    })
                    
                    // Get token for today (or create one)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const tomorrow = new Date(today)
                    tomorrow.setDate(tomorrow.getDate() + 1)
                    
                    let token = await tx.token.findFirst({
                        where: {
                            patientId: Number(patientId),
                            date: {
                                gte: today,
                                lt: tomorrow
                            }
                        }
                    })
                    
                    // If no token exists for today, create one
                    if (!token) {
                        // Get the highest token number for today across all patients
                        const todayTokens = await tx.token.findMany({
                            where: {
                                date: {
                                    gte: today,
                                    lt: tomorrow
                                },
                                patient: { clinicId }
                            },
                            orderBy: {
                                tokenNumber: 'desc'
                            },
                            take: 1
                        })
                        
                        const nextTokenNumber = todayTokens.length > 0 ? todayTokens[0].tokenNumber + 1 : 1
                        
                        token = await tx.token.create({
                            data: {
                                patientId: Number(patientId),
                                tokenNumber: nextTokenNumber,
                                date: today,
                                status: 'waiting'
                            }
                        })
                    }
                    
                    // Generate OPD number with patient registration-date prefix (YYMMDD).
                    const patientDateForId = patientData?.date || patientData?.createdAt || today
                    const patientCreatedAt = patientData?.createdAt || patientDateForId
                    const regDayStart = new Date(patientDateForId)
                    regDayStart.setHours(0, 0, 0, 0)
                    const regDayEnd = new Date(regDayStart)
                    regDayEnd.setDate(regDayEnd.getDate() + 1)

                    // Patient sequence/token is based on registration-day order in the same clinic.
                    const patientSequence = await tx.patient.count({
                        where: {
                            clinicId,
                            date: {
                                gte: regDayStart,
                                lt: regDayEnd
                            },
                            OR: [
                                { createdAt: { lt: patientCreatedAt } },
                                {
                                    AND: [
                                        { createdAt: patientCreatedAt },
                                        { id: { lte: Number(patientId) } }
                                    ]
                                }
                            ]
                        }
                    })

                    generatedOpdNo = generateOpdNo(patientDateForId, patientSequence, visitCount + 1)
                }
                
                // Auto-calculate visit number for new visits to ensure sequential uniqueness
                let resolvedVisitNumber = visitNumber ? Number(visitNumber) : undefined
                if (!isUpdate) {
                    // Get the highest visit number for this patient
                    const maxVisitNumberResult = await tx.visit.aggregate({
                        where: { patientId: Number(patientId) },
                        _max: { visitNumber: true }
                    })
                    const maxVisitNumber = maxVisitNumberResult._max.visitNumber || 0
                    const nextVisitNumber = maxVisitNumber + 1
                    
                    // If client sent a visitNumber, use the higher of client value or next sequential
                    // This prevents duplicates
                    resolvedVisitNumber = visitNumber ? Math.max(Number(visitNumber), nextVisitNumber) : nextVisitNumber
                }

                // 1. Create or update the visit
                const visitData = {
                    patientId: Number(patientId),
                    opdNo: generatedOpdNo || '',
                    date: date ? new Date(date) : undefined,
                    diagnoses,
                    temperament,
                    pulseDiagnosis,
                    pulseDiagnosis2,
                    majorComplaints,
                    historyReports,
                    investigations,
                    provisionalDiagnosis,
                    improvements,
                    specialNote,
                    discussion,
                    dob: dob ? new Date(dob) : undefined,
                    age: age ? Number(age) : undefined,
                    address,
                    gender,
                    phone,
                    nextVisit: nextVisit ? new Date(nextVisit) : undefined,
                    occupation,
                    pendingPaymentCents: pendingPaymentCents ? Number(pendingPaymentCents) : undefined,
                    height: height ? Number(height) : undefined,
                    weight: weight ? Number(weight) : undefined,
                    amount: amount ? Number(amount) : undefined,
                    discount: discount ? Number(discount) : undefined,
                    payment: payment ? Number(payment) : undefined,
                    balance: balance ? Number(balance) : undefined,
                    consultationFees: consultationFees ? Number(consultationFees) : 0,
                    visitNumber: resolvedVisitNumber,
                    followUpCount: followUpCount ? Number(followUpCount) : undefined,
                    reportsAttachments: reportsAttachments !== undefined ? reportsAttachments : undefined,
                    officeCopyPdfUrl: officeCopyPdfUrl || undefined,
                    isImported: false, // Explicitly mark as not imported for PDF generation
                    doctorId: getDoctorIdForCreate(user, req.body.doctorId)
                }
                
                let visit
                let oldVisitBalance: number | null = null // old balance in rupees (for edit, used to compute pending diff)
                if (isUpdate) {
                    // Fetch old visit balance before updating (needed to compute pending payment diff)
                    const oldVisitData = await tx.visit.findUnique({
                        where: { id: Number(id) },
                        select: { balance: true }
                    })
                    oldVisitBalance = oldVisitData?.balance != null ? Number(oldVisitData.balance) : null

                    // Update existing visit
                    visit = await tx.visit.update({
                        where: { id: Number(id) },
                        data: visitData
                    })
                    
                    // Determine whether new prescriptions are being submitted
                    const newPrescriptionCount = Array.isArray(prescriptions) ? prescriptions.length : 0

                    // Only restore + delete when new prescriptions are actually being provided.
                    // This prevents the restore from running without a corresponding deduction, which
                    // would leave inventory over-counted if the prescriptions array happened to be empty.
                    if (newPrescriptionCount > 0) {
                        // Before deleting prescriptions, restore inventory from old prescriptions
                        const oldPrescriptions = await tx.prescription.findMany({
                            where: { visitId: visit.id },
                            select: {
                                id: true,
                                productId: true,
                                quantity: true,
                                spy1: true,
                                spy2: true,
                                spy3: true,
                                spy4: true,
                                spy5: true,
                                spy6: true,
                            }
                        })

                        // Aggregate restore quantities per product ID (main product + SPAGYRIC spy components).
                        const restoreQtyMap = new Map<number, number>()
                        const spagyricRestoreMlByName = new Map<string, number>()

                        for (const oldPr of oldPrescriptions) {
                            if (oldPr.productId) {
                                restoreQtyMap.set(oldPr.productId, (restoreQtyMap.get(oldPr.productId) || 0) + oldPr.quantity)
                            }

                            const spyUsage = getSpagyricMlUsageByNameFromPrescription(oldPr)
                            spyUsage.forEach((ml, name) => {
                                spagyricRestoreMlByName.set(name, (spagyricRestoreMlByName.get(name) || 0) + ml)
                            })
                        }

                        if (spagyricRestoreMlByName.size > 0) {
                            const spagyricNames = [...spagyricRestoreMlByName.keys()]
                            const spagyricProducts = await tx.product.findMany({
                                where: {
                                    name: { in: spagyricNames },
                                    category: { name: SPAGYRIC_CATEGORY_NAME },
                                },
                                select: { id: true, name: true },
                            })

                            const spagyricProductIdByName = new Map<string, number>(
                                spagyricProducts.map((p: any) => [String(p.name || '').trim().toUpperCase(), Number(p.id)] as [string, number])
                            )

                            for (const [name, ml] of spagyricRestoreMlByName) {
                                const pid = spagyricProductIdByName.get(name)
                                if (!pid) continue
                                restoreQtyMap.set(pid, (restoreQtyMap.get(pid) || 0) + ml)
                            }
                        }

                        const restoreProductIds = [...restoreQtyMap.keys()]

                        if (restoreProductIds.length > 0) {
                            const oldProducts = await tx.product.findMany({
                                where: { id: { in: restoreProductIds } }
                            })
                            const oldProductMap = new Map(oldProducts.map((p: any) => [p.id, p]))

                            // Restore inventory in batch with absolute values to keep salesValue/inventoryValue accurate
                            for (const [prodId, qtyToRestore] of restoreQtyMap) {
                                const prod: any = oldProductMap.get(prodId)
                                if (prod) {
                                    const restoredTotalSales = Math.max(0, (prod.totalSales || 0) - qtyToRestore)
                                    const restoredFlowInventory = (prod.totalPurchased || 0) - restoredTotalSales
                                    const restoredSalesValue = restoredTotalSales * (prod.priceRupees || 0)
                                    const restoredInventoryValue = restoredFlowInventory * (prod.priceRupees || 0)
                                    await tx.product.update({
                                        where: { id: prodId },
                                        data: {
                                            quantity: Math.max(0, restoredFlowInventory),
                                            totalSales: restoredTotalSales,
                                            salesValue: restoredSalesValue,
                                            inventoryValue: restoredInventoryValue
                                        }
                                    })
                                }
                            }
                        }

                        // Delete old prescriptions so they can be replaced with new ones
                        await tx.prescription.deleteMany({
                            where: { visitId: visit.id }
                        })
                    }
                } else {
                    // Create new visit
                    visit = await tx.visit.create({ data: visitData })
                }

                // Update patient with clinical information for future reference
                if (patientId) {
                    const patientUpdateData: any = {}
                    if (temperament) patientUpdateData.temperament = temperament
                    if (pulseDiagnosis) patientUpdateData.pulseDiagnosis = pulseDiagnosis
                    if (majorComplaints) patientUpdateData.majorComplaints = majorComplaints
                    if (historyReports) patientUpdateData.historyReports = historyReports
                    if (investigations) patientUpdateData.investigations = investigations
                    if (provisionalDiagnosis) patientUpdateData.provisionalDiagnosis = provisionalDiagnosis
                    if (improvements) patientUpdateData.improvements = improvements

                    // Auto-update patient pending payments based on visit balance.
                    // On create: always auto-adjust from the visit financials.
                    // On edit: pending override is allowed only when explicitly requested.
                    const hasExplicitPending = pendingPaymentCents !== undefined && pendingPaymentCents !== null && pendingPaymentCents !== ''
                    const canOverridePending = isUpdate && overridePendingPayment === true && hasExplicitPending

                    if (canOverridePending) {
                        patientUpdateData.pendingPaymentCents = Math.max(0, Math.round(Number(pendingPaymentCents)))
                    } else {
                        // Authoritative pending is the sum of all visit balances for this patient.
                        // This automatically fixes old/stale pending values and edit-delta drift.
                        const visitBalanceAggregate = await tx.visit.aggregate({
                            where: { patientId: Number(patientId) },
                            _sum: { balance: true }
                        })
                        const summedPending = Number(visitBalanceAggregate?._sum?.balance ?? 0)
                        patientUpdateData.pendingPaymentCents = Math.max(0, Math.round(summedPending))
                    }
                    
                    if (Object.keys(patientUpdateData).length > 0) {
                        await tx.patient.update({
                            where: { id: Number(patientId) },
                            data: patientUpdateData
                        })
                    }
                }


                let createdPrescriptions: any[] = []
                let invoiceItems: any[] = []
                let productUpdates: any[] = []

                // 2. Process prescriptions if provided
                
                if (Array.isArray(prescriptions) && prescriptions.length > 0) {
                    // Collect all prescription data first
                    const prescriptionDataArray = prescriptions.map((pr) => {
                        const prescriptionData: any = {
                            visitId: visit.id,
                            productId: pr.productId ? Number(pr.productId) : undefined,
                            quantity: Number(pr.quantity || 1),
                            timing: pr.timing || null,
                            dosage: pr.dosage || null,
                            procedure: pr.procedure || null,
                            presentation: pr.presentation || null,
                            spy1: pr.spy1 || null,
                            spy2: pr.spy2 || null,
                            spy3: pr.spy3 || null,
                            spy4: pr.spy4 || null,
                            spy5: pr.spy5 || null,
                            spy6: pr.spy6 || null,
                            addition1: pr.addition1 || null,
                            addition2: pr.addition2 || null,
                            addition3: pr.addition3 || null,
                            bottleSize: pr.bottleSize || null,
                            patientHasMedicine: !!pr.patientHasMedicine,
                            administration: pr.administration || null,
                            discussions: pr.discussions || null,
                            selectedDropper: pr.selectedDropper || null,
                            selectedLabel: pr.selectedLabel || null,
                            includeLabelProduct: pr.includeLabelProduct !== undefined ? !!pr.includeLabelProduct : true,
                            taken: !!pr.taken,
                            dispensed: !!pr.dispensed,
                            optionProductIds: pr.optionProductIds && pr.optionProductIds.length > 0 ? JSON.stringify(pr.optionProductIds) : null,
                            activeOptionIndex: pr.activeOptionIndex !== undefined && pr.activeOptionIndex !== -1 ? Number(pr.activeOptionIndex) : null
                        }

                        if (pr.treatmentId && String(pr.treatmentId).trim() !== '') {
                            prescriptionData.treatmentId = Number(pr.treatmentId)
                        }

                        return prescriptionData
                    })

                    // Batch create all prescriptions
                    await tx.prescription.createMany({
                        data: prescriptionDataArray
                    })
                    
                    // Fetch the created prescriptions
                    createdPrescriptions = await tx.prescription.findMany({
                        where: { visitId: visit.id }
                    })

                    // Get all unique product IDs that need inventory updates (filter out invalid IDs)
                    // Skip products where patientHasMedicine is true (patient already has it, no dispensing)
                    const dispensablePrescriptions = prescriptions.filter((pr: any) =>
                        pr.productId && !isNaN(Number(pr.productId)) && !pr.patientHasMedicine
                    )

                    // Aggregate quantities per product ID to handle duplicates correctly.
                    // Includes both primary prescription products and SPAGYRIC components
                    // where spy volume is interpreted as drops (20 drops = 1 ml).
                    const aggregatedQty = new Map<number, number>()
                    for (const pr of dispensablePrescriptions) {
                        const pid = Number(pr.productId)
                        const qty = Number(pr.quantity || 1)
                        aggregatedQty.set(pid, (aggregatedQty.get(pid) || 0) + qty)
                    }

                    const spagyricMlByName = new Map<string, number>()
                    for (const pr of dispensablePrescriptions) {
                        const spyUsage = getSpagyricMlUsageByNameFromPrescription(pr)
                        spyUsage.forEach((ml, name) => {
                            spagyricMlByName.set(name, (spagyricMlByName.get(name) || 0) + ml)
                        })
                    }

                    if (spagyricMlByName.size > 0) {
                        const spagyricNames = [...spagyricMlByName.keys()]
                        const spagyricProducts = await tx.product.findMany({
                            where: {
                                name: { in: spagyricNames },
                                category: { name: SPAGYRIC_CATEGORY_NAME },
                            },
                            select: { id: true, name: true },
                        })

                        const spagyricProductIdByName = new Map<string, number>(
                            spagyricProducts.map((p: any) => [String(p.name || '').trim().toUpperCase(), Number(p.id)] as [string, number])
                        )

                        for (const [name, ml] of spagyricMlByName) {
                            const pid = spagyricProductIdByName.get(name)
                            if (!pid) continue
                            aggregatedQty.set(pid, (aggregatedQty.get(pid) || 0) + ml)
                        }
                    }

                    const productIds = [...aggregatedQty.keys()]
                    
                    if (productIds.length > 0) {
                        // Fetch all products at once
                        const products = await tx.product.findMany({
                            where: { id: { in: productIds } },
                            include: { category: true }
                        })
                        
                        const productMap = new Map(products.map((p: any) => [p.id, p]))

                        // Process inventory updates using aggregated quantities
                        for (const [pid, totalQtyToConsume] of aggregatedQty) {
                            const prod: any = productMap.get(pid)
                            
                            if (prod) {
                                // Flow inventory is calculated as: totalPurchased - totalSales
                                const newTotalSales = (prod.totalSales || 0) + totalQtyToConsume
                                const newFlowInventory = (prod.totalPurchased || 0) - newTotalSales
                                // Sales Value = sale price per unit × total sales qty
                                const newSalesValue = newTotalSales * (prod.priceRupees || 0)
                                // Inventory Value = sale price per unit × flow inventory qty
                                const newInventoryValue = Math.max(0, newFlowInventory) * (prod.priceRupees || 0)
                                
                                // Collect for batch update
                                productUpdates.push({ 
                                    id: pid, 
                                    quantity: Math.max(0, newFlowInventory),
                                    totalSales: newTotalSales,
                                    salesValue: newSalesValue,
                                    inventoryValue: newInventoryValue,
                                    priceRupees: prod.priceRupees,
                                    name: prod.name,
                                    qtyConsumed: totalQtyToConsume
                                })
                            }
                        }

                        // Prepare invoice items (use all dispensable prescriptions, not aggregated)
                        for (const pr of dispensablePrescriptions) {
                            const pid = Number(pr.productId)
                            const qtyToConsume = Number(pr.quantity || 1)
                            const prod: any = productMap.get(pid)
                            if (prod) {
                                const gstRate = 5 // 5% GST
                                const inclusivePrice = qtyToConsume * (prod.priceRupees || 0)
                                invoiceItems.push({
                                    productId: pid,
                                    description: prod.name,
                                    quantity: qtyToConsume,
                                    unitPrice: prod.priceRupees,
                                    taxRate: gstRate,
                                    discount: 0,
                                    totalAmount: inclusivePrice
                                })
                            }
                        }

                        // Batch update all products with recalculated values
                        for (const update of productUpdates) {
                            await tx.product.update({
                                where: { id: update.id },
                                data: {
                                    quantity: update.quantity,
                                    totalSales: update.totalSales,
                                    salesValue: update.salesValue,
                                    inventoryValue: update.inventoryValue
                                }
                            })
                        }
                    }
                }

                // 3. Process MISC products (deplete inventory but don't add to invoice)
                if (isUpdate) {
                    // STEP 1: Restore ALL old MISC products inventory when editing
                    // This ensures any changed/removed products get their inventory back
                    const oldVisit = await tx.visit.findUnique({
                        where: { id: visit.id },
                        include: {
                            prescriptions: true
                        }
                    })
                    
                    if (oldVisit && oldVisit.prescriptions) {
                        // Collect all old MISC product IDs
                        const oldMiscProductIds: number[] = []
                        const labelNamesToRestore: string[] = []
                        
                        // 1. Restore droppers from old prescriptions
                        oldVisit.prescriptions.forEach((pr: any) => {
                            if (pr.selectedDropper && !isNaN(Number(pr.selectedDropper))) {
                                oldMiscProductIds.push(Number(pr.selectedDropper))
                            }
                            // 2. Collect label names to restore
                            if (pr.includeLabelProduct !== false && pr.selectedLabel) {
                                labelNamesToRestore.push(pr.selectedLabel)
                            }
                        })
                        
                        // 3. Always restore default MISC products (RX PAD, FILE COVER, ENVELOPS)
                        const defaultMiscNames = ['RX PAD', 'FILE COVER', 'ENVELOPS']
                        const defaultMiscProducts = await tx.product.findMany({
                            where: {
                                name: { in: defaultMiscNames },
                                category: { name: 'MISC' }
                            }
                        })
                        defaultMiscProducts.forEach((p: any) => oldMiscProductIds.push(p.id))
                        
                        // 4. Find label products by name and add their IDs
                        if (labelNamesToRestore.length > 0) {
                            const labelProducts = await tx.product.findMany({
                                where: {
                                    name: { in: labelNamesToRestore }
                                }
                            })
                            labelProducts.forEach((p: any) => oldMiscProductIds.push(p.id))
                        }
                        
                        // 5. Restore inventory for ALL old MISC products
                        if (oldMiscProductIds.length > 0) {
                            // Get unique product IDs
                            const uniqueOldProductIds = [...new Set(oldMiscProductIds)]
                            const oldMiscProductsData = await tx.product.findMany({
                                where: { id: { in: uniqueOldProductIds } }
                            })
                            
                            // Restore each product's inventory
                            for (const prod of oldMiscProductsData) {
                                // Count how many times this product was used in old visit
                                const count = oldMiscProductIds.filter(id => id === prod.id).length
                                
                                // RESTORE: Decrease totalSales (which increases available quantity)
                                const restoredTotalSales = Math.max(0, prod.totalSales - count)
                                const restoredQuantity = (prod.totalPurchased || 0) - restoredTotalSales
                                const restoredSalesValue = restoredTotalSales * (prod.priceRupees || 0)
                                const restoredInventoryValue = Math.max(0, restoredQuantity) * (prod.priceRupees || 0)
                                
                                await tx.product.update({
                                    where: { id: prod.id },
                                    data: {
                                        quantity: Math.max(0, restoredQuantity),
                                        totalSales: restoredTotalSales,
                                        salesValue: restoredSalesValue,
                                        inventoryValue: restoredInventoryValue
                                    }
                                })
                            }
                        }
                    }
                }
                
                // STEP 2: Apply NEW MISC products inventory depletion
                // After restoration (if editing), now deplete based on the new visit's MISC products
                if (Array.isArray(miscProducts) && miscProducts.length > 0) {
                    // Get unique product IDs from misc products
                    const miscProductIds = [...new Set(
                        miscProducts
                            .filter(mp => mp.productId && !isNaN(Number(mp.productId)))
                            .map(mp => Number(mp.productId))
                    )]
                    
                    if (miscProductIds.length > 0) {
                        // Fetch all misc products at once
                        const miscProductsData = await tx.product.findMany({
                            where: { id: { in: miscProductIds } }
                        })
                        
                        const miscProductMap = new Map(miscProductsData.map((p: any) => [p.id, p]))

                        // Group misc products by productId to calculate total quantity
                        const miscProductQuantities = new Map<number, number>()
                        for (const mp of miscProducts) {
                            if (!mp.productId || isNaN(Number(mp.productId))) continue
                            const pid = Number(mp.productId)
                            const qty = Number(mp.quantity || 1)
                            miscProductQuantities.set(pid, (miscProductQuantities.get(pid) || 0) + qty)
                        }

                        // DEPLETE: Update inventory for new MISC products (increase totalSales, decrease quantity)
                        for (const [pid, totalQty] of miscProductQuantities) {
                            const prod: any = miscProductMap.get(pid)
                            
                            if (prod) {
                                const newTotalSales = prod.totalSales + totalQty
                                const newFlowInventory = (prod.totalPurchased || 0) - newTotalSales
                                const newSalesValue = newTotalSales * (prod.priceRupees || 0)
                                const newInventoryValue = Math.max(0, newFlowInventory) * (prod.priceRupees || 0)
                                
                                await tx.product.update({
                                    where: { id: pid },
                                    data: {
                                        quantity: Math.max(0, newFlowInventory),
                                        totalSales: newTotalSales,
                                        salesValue: newSalesValue,
                                        inventoryValue: newInventoryValue
                                    }
                                })
                            }
                        }
                    }
                }

                // 6. Auto-generate or update customer invoice
                let invoice = null
                
                // Check if invoice already exists for this visit (when editing)
                const existingInvoice = isUpdate ? await tx.customerInvoice.findFirst({
                    where: { 
                        visitId: visit.id
                    },
                    include: { items: true }
                }) : null

                if ((autoGenerateInvoice || existingInvoice) && invoiceItems.length > 0 && patientData) {
                        // Calculate totals with GST extraction
                        const gstRate = 5 // Default 5% GST
                        const totalInclusive = invoiceItems.reduce((sum, item) => sum + item.totalAmount, 0)
                        
                        // Extract GST from inclusive price
                        // Formula: GST Amount = (Inclusive Price × GST Rate) / (100 + GST Rate)
                        const taxAmount = (totalInclusive * gstRate) / (100 + gstRate)
                        const subtotal = totalInclusive - taxAmount
                        
                        const totalAmount = totalInclusive
                        const paidAmount = payment ? Number(payment) : 0
                        const balanceAmount = totalAmount - paidAmount

                        if (existingInvoice) {
                            // Update existing invoice
                            // First delete old items
                            await tx.customerInvoiceItem.deleteMany({
                                where: { customerInvoiceId: existingInvoice.id }
                            })
                            
                            // Then update invoice with new data
                            invoice = await tx.customerInvoice.update({
                                where: { id: existingInvoice.id },
                                data: {
                                    customerName: `${patientData.firstName} ${patientData.lastName || ''}`,
                                    customerEmail: patientData.email || undefined,
                                    customerPhone: patientData.phone || undefined,
                                    customerAddress: patientData.address || undefined,
                                    dueDate: nextVisit ? new Date(nextVisit) : undefined,
                                    status: 'paid',
                                    subtotal: Math.round(subtotal),
                                    taxAmount: Math.round(taxAmount),
                                    discount: 0,
                                    totalAmount: Math.round(totalAmount),
                                    paidAmount: Math.round(paidAmount),
                                    balanceAmount: Math.round(balanceAmount),
                                    notes: `Auto-generated from visit ${opdNo}`,
                                    clinicId,
                                    items: {
                                        create: invoiceItems
                                    }
                                },
                                include: {
                                    items: true
                                }
                            })
                        } else {
                            // Create new invoice
                            let invoiceCreateError: any = null
                            for (let attempt = 0; attempt < 8; attempt++) {
                                const lastInvoice = await tx.customerInvoice.findFirst({
                                    select: { id: true },
                                    orderBy: { id: 'desc' }
                                })
                                const invoiceNumber = `INV-${String((lastInvoice?.id || 0) + 1 + attempt).padStart(6, '0')}`

                                try {
                                    invoice = await tx.customerInvoice.create({
                                        data: {
                                            invoiceNumber,
                                            visitId: visit.id,
                                            patientId: Number(patientId),
                                            customerName: `${patientData.firstName} ${patientData.lastName || ''}`,
                                            customerEmail: patientData.email || undefined,
                                            customerPhone: patientData.phone || undefined,
                                            customerAddress: patientData.address || undefined,
                                            invoiceDate: new Date(),
                                            dueDate: nextVisit ? new Date(nextVisit) : undefined,
                                            status: 'paid',
                                            subtotal: Math.round(subtotal),
                                            taxAmount: Math.round(taxAmount),
                                            discount: 0,
                                            totalAmount: Math.round(totalAmount),
                                            paidAmount: Math.round(paidAmount),
                                            balanceAmount: Math.round(balanceAmount),
                                            notes: `Auto-generated from visit ${opdNo}`,
                                            doctorId: getDoctorIdForCreate(user, req.body.doctorId),
                                            clinicId,
                                            items: {
                                                create: invoiceItems
                                            }
                                        },
                                        include: {
                                            items: true
                                        }
                                    })
                                    invoiceCreateError = null
                                    break
                                } catch (err: any) {
                                    if (err?.code === 'P2002') {
                                        invoiceCreateError = err
                                        continue
                                    }
                                    throw err
                                }
                            }

                            if (!invoice) {
                                throw invoiceCreateError || new Error('Could not generate unique invoice number')
                            }
                        }
                }

                return { visit, invoice, prescriptions: createdPrescriptions, opdNo: generatedOpdNo, productUpdates }
            }, {
                timeout: 60000 // Increase timeout to 60 seconds for complex operations
            })

            // Handle stock transactions and product reorders after transaction (non-critical operations)
            if (result.productUpdates && result.productUpdates.length > 0) {
                try {
                    // Create stock transactions for audit trail
                    const stockTransactions = result.productUpdates.map((update: any) => {
                        const qtyConsumed = update.qtyConsumed || 1
                        return {
                            productId: update.id,
                            transactionType: 'OUT',
                            quantity: qtyConsumed,
                            unitPrice: update.priceRupees,
                            totalValue: qtyConsumed * (update.priceRupees || 0),
                            balanceQuantity: update.quantity,
                            referenceType: 'Visit',
                            referenceId: result.visit.id,
                            notes: `Dispensed for visit ${result.opdNo}`,
                            performedBy: user.email
                        }
                    })

                    await prisma.stockTransaction.createMany({
                        data: stockTransactions
                    })

                    // Check for reorder needs
                    for (const update of result.productUpdates) {
                        const product = await prisma.product.findUnique({
                            where: { id: update.id },
                            include: { category: true }
                        })

                        if (product) {
                            const reorderLevel = product.category?.reorderLevel ?? 10
                            if (update.quantity <= reorderLevel) {
                                const existingOrder = await prisma.productOrder.findFirst({
                                    where: {
                                        productId: update.id,
                                        status: 'pending'
                                    }
                                })

                                if (!existingOrder) {
                                    const orderQty = Math.max(reorderLevel * 2, 10)
                                    await prisma.productOrder.create({
                                        data: {
                                            productId: update.id,
                                            quantity: orderQty,
                                            status: 'pending',
                                            orderVia: 'AUTO_REORDER'
                                        }
                                    })
                                }
                            }
                        }
                    }
                } catch (error) {
                }
            }

            // Fetch complete visit with prescriptions after transaction completes
            const fullVisit = await prisma.visit.findUnique({ 
                where: { id: result.visit.id }, 
                include: { prescriptions: true } 
            })

            // Create or update suggested task for receptionist with 1 hour expiry (outside transaction)
            if (result.prescriptions.length > 0 && patientData) {
                try {
                    const oneHourLater = new Date()
                    oneHourLater.setHours(oneHourLater.getHours() + 1)

                    // Build task description with attachments
                    let taskDescription = `Visit OPD No: ${result.opdNo}\nPatient: ${patientData.firstName} ${patientData.lastName || ''}\nPrescriptions: ${result.prescriptions.length} item(s)`
                    
                    // Add reports attachments to description if provided
                    if (reportsAttachments && typeof reportsAttachments === 'string') {
                        try {
                            const attachments = JSON.parse(reportsAttachments)
                            if (Array.isArray(attachments) && attachments.length > 0) {
                                taskDescription += `\n\nAttachments (${attachments.length}):`
                                attachments.forEach((att: any, idx: number) => {
                                    taskDescription += `\n${idx + 1}. ${att.name || 'File'}: ${att.url}`
                                })
                            }
                        } catch (e) {
                        }
                    }

                    // Check if a suggested task already exists for this visit
                    const existingTask = await prisma.task.findFirst({
                        where: {
                            visitId: result.visit.id,
                            isSuggested: true,
                            assignedTo: null // Only update if not yet assigned
                        }
                    })

                    if (existingTask) {
                        // Update existing task
                        await prisma.task.update({
                            where: { id: existingTask.id },
                            data: {
                                title: `Process prescription for ${patientData.firstName} ${patientData.lastName || ''}`,
                                description: taskDescription,
                                expiresAt: oneHourLater,
                                attachmentUrl: officeCopyPdfUrl || null
                            }
                        })
                    } else {
                        // Create new suggested task with doctorId
                        await prisma.task.create({
                            data: {
                                title: `Process prescription for ${patientData.firstName} ${patientData.lastName || ''}`,
                                description: taskDescription,
                                type: 'task',
                                status: 'pending',
                                isSuggested: true,
                                expiresAt: oneHourLater,
                                visitId: result.visit.id,
                                doctorId: doctorIdForTask, // Link task to the doctor
                                attachmentUrl: officeCopyPdfUrl || null
                            }
                        })
                    }
                } catch (taskError) {
                    // Log task creation error but don't fail the whole request
                }
            }

            return res.status(201).json(fullVisit)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'DELETE') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        const { id } = req.query
        
        if (!id) {
            return res.status(400).json({ error: 'Visit ID is required' })
        }
        
        try {
            // Verify visit belongs to user's clinic before deleting
            const clinicId = getClinicIdFromUser(user)
            const visit = await prisma.visit.findFirst({
                where: {
                    id: Number(id),
                    patient: clinicId ? { clinicId } : undefined
                }
            })

            if (!visit) {
                return res.status(404).json({ error: 'Visit not found or access denied' })
            }

            // Delete associated prescriptions first
            await prisma.prescription.deleteMany({
                where: { visitId: Number(id) }
            })
            
            // Then delete the visit
            await prisma.visit.delete({
                where: { id: Number(id) }
            })
            
            return res.status(200).json({ message: 'Visit deleted successfully' })
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
