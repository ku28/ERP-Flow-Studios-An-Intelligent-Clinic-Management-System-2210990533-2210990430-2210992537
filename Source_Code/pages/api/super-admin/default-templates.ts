import type { NextApiRequest, NextApiResponse } from 'next'
import { Readable } from 'stream'
import csvParser from 'csv-parser'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import { createCurrentCategoryFieldRulesBaseline } from '../../../lib/categoryFieldRules'

type TemplateType = 'product' | 'treatment'

interface DefaultValueConfig {
    page: string
    label: string
    values: Record<string, any>
}

const DEFAULT_CONFIGS: DefaultValueConfig[] = [
    {
        page: 'treatments',
        label: 'Treatment Plans',
        values: {
            quantity: 15,
            bottleSize: '15',
            timing: 'AM',
            doseQuantity: '10',
            doseTiming: 'TDS',
            dilution: 'WATER',
            procedure: 'ORAL',
            presentation: 'DRP',
            showImportPulseForNewDefaults: true,
            categoryFieldRules: createCurrentCategoryFieldRulesBaseline()
        }
    },
    {
        page: 'prescriptions',
        label: 'Prescriptions',
        values: {
            quantity: 15,
            bottleSize: '15',
            timing: 'AM',
            doseQuantity: '10',
            doseTiming: 'TDS',
            dilution: 'WATER',
            procedure: 'ORAL',
            presentation: 'DRP',
            gstRate: 5,
            consultationFees: 200,
            allowKeywordLearning: true,
            categoryFieldRules: createCurrentCategoryFieldRulesBaseline()
        }
    },
    {
        page: 'products',
        label: 'Products',
        values: {
            minStockLevel: '200',
            showImportPulseForNewDefaults: true,
        }
    },
    { page: 'patients', label: 'Patients', values: {} },
    { page: 'suppliers', label: 'Suppliers', values: {} },
    { page: 'visits', label: 'Visits', values: {} },
    {
        page: 'purchaseOrders',
        label: 'Purchase Orders',
        values: {
            status: 'pending'
        }
    },
    {
        page: 'invoices',
        label: 'Analytics',
        values: {
            gstRate: 5,
            consultationFees: 200,
            manufacturer: '',
            batch: '',
            expiry: ''
        }
    }
]

function normalizeKey(key: string): string {
    return String(key || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function normalizeValue(value: unknown): string | null {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
}

function parseNumber(value: unknown, fallback: number | null = null): number | null {
    if (value === undefined || value === null || String(value).trim() === '') return fallback
    const normalized = String(value).replace(/[^0-9.-]/g, '')
    if (!normalized) return fallback
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
}

function parseInteger(value: unknown, fallback: number | null = null): number | null {
    const parsed = parseNumber(value, fallback)
    if (parsed === null || parsed === undefined) return fallback
    return Math.round(parsed)
}

function getFromMap(row: Record<string, unknown>, keys: string[]): unknown {
    const normalizedMap: Record<string, unknown> = {}
    Object.keys(row || {}).forEach((key) => {
        normalizedMap[normalizeKey(key)] = row[key]
    })

    for (const key of keys) {
        const normalized = normalizeKey(key)
        if (normalized in normalizedMap) {
            return normalizedMap[normalized]
        }
    }

    return undefined
}

async function parseCsvText(csvText: string): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
        const rows: Record<string, unknown>[] = []
        Readable.from([csvText])
            .pipe(csvParser())
            .on('data', (row: Record<string, unknown>) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject)
    })
}

function mapProductRow(row: Record<string, unknown>, version: number) {
    const name = normalizeValue(getFromMap(row, ['name', 'item', 'productName', 'product name']))
    if (!name) return null

    return {
        name,
        priceRupees: parseNumber(getFromMap(row, ['priceRupees', 'rate/unit', 'rate', 'price']), 0) ?? 0,
        quantity: parseInteger(getFromMap(row, ['quantity', 'inventory', 'inventory(flow)', 'stock']), 0) ?? 0,
        purchasePriceRupees: parseNumber(getFromMap(row, ['purchasePriceRupees', 'purchaseprice/pack', 'purchasePrice', 'p/price']), 0) ?? 0,
        unit: normalizeValue(getFromMap(row, ['unit', 'units', 'unitType'])),
        category: normalizeValue(getFromMap(row, ['category', 'categoryName'])),
        description: normalizeValue(getFromMap(row, ['description'])),
        minStockLevel: parseInteger(getFromMap(row, ['minStockLevel', 'thresh/in', 'threshold']), 200) ?? 200,
        actualInventory: parseInteger(getFromMap(row, ['actualInventory'])),
        inventoryValue: parseNumber(getFromMap(row, ['inventoryValue'])),
        latestUpdate: (() => {
            const raw = normalizeValue(getFromMap(row, ['latestUpdate']))
            if (!raw) return null
            const dt = new Date(raw)
            return Number.isNaN(dt.getTime()) ? null : dt
        })(),
        purchaseValue: parseNumber(getFromMap(row, ['purchaseValue'])),
        salesValue: parseNumber(getFromMap(row, ['salesValue'])),
        totalPurchased: parseInteger(getFromMap(row, ['totalPurchased', 'purchase(flow)', 'purchase']), 0) ?? 0,
        totalSales: parseInteger(getFromMap(row, ['totalSales', 'sales(flow)', 'sales']), 0) ?? 0,
        version,
        createdAt: new Date(),
    }
}

function mapTreatmentRow(row: Record<string, unknown>, version: number) {
    const planNumber = normalizeValue(getFromMap(row, ['planNumber', 'plan_number', 'plan number']))
    const name = normalizeValue(getFromMap(row, ['name']))
    const productName = normalizeValue(getFromMap(row, ['productName', 'product_name', 'product name']))

    if (!planNumber && !name && !productName) return null

    return {
        name,
        description: normalizeValue(getFromMap(row, ['description'])),
        priceRupees: parseNumber(getFromMap(row, ['priceRupees', 'price'])),
        duration: parseInteger(getFromMap(row, ['duration'])),
        planNumber,
        provDiagnosis: normalizeValue(getFromMap(row, ['provDiagnosis', 'prov_diagnosis', 'diagnosis'])),
        speciality: normalizeValue(getFromMap(row, ['speciality', 'specialty'])),
        imbalance: normalizeValue(getFromMap(row, ['imbalance'])),
        systems: normalizeValue(getFromMap(row, ['systems', 'system'])),
        organ: normalizeValue(getFromMap(row, ['organ'])),
        diseaseAction: normalizeValue(getFromMap(row, ['diseaseAction', 'disease_action'])),
        pulseDiagnosis: normalizeValue(getFromMap(row, ['pulseDiagnosis', 'pulse_diagnosis'])),
        treatmentPlan: normalizeValue(getFromMap(row, ['treatmentPlan', 'treatment_plan'])),
        notes: normalizeValue(getFromMap(row, ['notes'])),
        drn: normalizeValue(getFromMap(row, ['drn'])),
        productName,
        spy1: normalizeValue(getFromMap(row, ['spy1'])),
        spy2: normalizeValue(getFromMap(row, ['spy2'])),
        spy3: normalizeValue(getFromMap(row, ['spy3'])),
        spy4: normalizeValue(getFromMap(row, ['spy4'])),
        spy5: normalizeValue(getFromMap(row, ['spy5'])),
        spy6: normalizeValue(getFromMap(row, ['spy6'])),
        timing: normalizeValue(getFromMap(row, ['timing'])),
        dosage: normalizeValue(getFromMap(row, ['dosage'])),
        doseQuantity: normalizeValue(getFromMap(row, ['doseQuantity', 'dose_quantity', 'dose quantity'])),
        doseTiming: normalizeValue(getFromMap(row, ['doseTiming', 'dose_timing', 'dose timing'])),
        dilution: normalizeValue(getFromMap(row, ['dilution'])),
        addition1: normalizeValue(getFromMap(row, ['addition1', 'addition 1'])),
        addition2: normalizeValue(getFromMap(row, ['addition2', 'addition 2'])),
        addition3: normalizeValue(getFromMap(row, ['addition3', 'addition 3'])),
        procedure: normalizeValue(getFromMap(row, ['procedure'])),
        presentation: normalizeValue(getFromMap(row, ['presentation'])),
        bottleSize: normalizeValue(getFromMap(row, ['bottleSize', 'bottle_size', 'bottle size'])),
        quantity: parseInteger(getFromMap(row, ['quantity', 'qty'])),
        administration: normalizeValue(getFromMap(row, ['administration', 'product administration'])),
        version,
        createdAt: new Date(),
    }
}

function stableStringify(value: any): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return `[${value.map((v) => stableStringify(v)).join(',')}]`
    }
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

async function requireSuperAdmin(req: NextApiRequest) {
    const token = req.cookies.session
    if (!token) return null

    const decoded = verifySessionToken(token) as { sub?: number } | null
    if (!decoded?.sub) return null

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } })
    if (!user || user.role !== 'super_admin') return null

    return user
}

async function createManyInBatches(model: { createMany: (args: { data: any[] }) => Promise<any> }, rows: any[]) {
    const batchSize = 500
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        await model.createMany({ data: batch })
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireSuperAdmin(req)
    if (!user) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (req.method === 'GET') {
        try {
            const [
                latestProductAgg,
                latestTreatmentAgg,
                globalDefaultsDb,
                clinicCount,
            ] = await Promise.all([
                prisma.defaultProduct.aggregate({ _max: { version: true } }),
                prisma.defaultTreatment.aggregate({ _max: { version: true } }),
                prisma.defaultValue.findMany({ where: { clinicId: null }, orderBy: { page: 'asc' } }),
                prisma.clinic.count(),
            ])

            const latestProductVersion = latestProductAgg._max.version || 0
            const latestTreatmentVersion = latestTreatmentAgg._max.version || 0

            const [
                productRows,
                treatmentRows,
                syncedProductClinics,
                syncedTreatmentClinics,
            ] = await Promise.all([
                latestProductVersion
                    ? prisma.defaultProduct.count({ where: { version: latestProductVersion } })
                    : Promise.resolve(0),
                latestTreatmentVersion
                    ? prisma.defaultTreatment.count({ where: { version: latestTreatmentVersion } })
                    : Promise.resolve(0),
                latestProductVersion
                    ? prisma.clinicDefaultTemplateSync.count({ where: { templateType: 'product', version: latestProductVersion } })
                    : Promise.resolve(0),
                latestTreatmentVersion
                    ? prisma.clinicDefaultTemplateSync.count({ where: { templateType: 'treatment', version: latestTreatmentVersion } })
                    : Promise.resolve(0),
            ])

            const defaultConfigByPage = new Map(
                DEFAULT_CONFIGS.map((config) => [config.page, config])
            )

            const storedDefaults = globalDefaultsDb.map((d: any) => {
                const baseline = defaultConfigByPage.get(d.page)
                return {
                    page: d.page,
                    label: d.label || baseline?.label || d.page,
                    values: {
                        ...(baseline?.values || {}),
                        ...((d.values && typeof d.values === 'object' && !Array.isArray(d.values)) ? d.values : {}),
                    },
                }
            })

            const storedPages = new Set(storedDefaults.map((item: any) => item.page))
            const missingDefaults = DEFAULT_CONFIGS
                .filter((config) => !storedPages.has(config.page))
                .map((config) => ({
                    page: config.page,
                    label: config.label,
                    values: { ...(config.values || {}) },
                }))

            const globalDefaults = [...storedDefaults, ...missingDefaults]
                .sort((a, b) => String(a.page).localeCompare(String(b.page)))

            return res.status(200).json({
                latestProductVersion,
                latestTreatmentVersion,
                latestProductRows: productRows,
                latestTreatmentRows: treatmentRows,
                syncedProductClinics,
                syncedTreatmentClinics,
                totalClinics: clinicCount,
                globalDefaults,
            })
        } catch (error: any) {
            return res.status(500).json({ error: error?.message || 'Failed to load defaults' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { templateType, csvText } = req.body as { templateType?: TemplateType; csvText?: string }

            if (!templateType || !['product', 'treatment'].includes(templateType)) {
                return res.status(400).json({ error: 'templateType must be product or treatment' })
            }

            if (!csvText || !csvText.trim()) {
                return res.status(400).json({ error: 'CSV data is required' })
            }

            const rows = await parseCsvText(csvText)
            if (!rows.length) {
                return res.status(400).json({ error: 'No rows found in CSV file' })
            }

            const nextVersion = templateType === 'product'
                ? ((await prisma.defaultProduct.aggregate({ _max: { version: true } }))._max.version || 0) + 1
                : ((await prisma.defaultTreatment.aggregate({ _max: { version: true } }))._max.version || 0) + 1

            if (templateType === 'product') {
                const mapped = rows.map((r) => mapProductRow(r, nextVersion)).filter(Boolean)
                if (!mapped.length) {
                    return res.status(400).json({ error: 'No valid product rows found in CSV' })
                }

                await prisma.$transaction(async (tx: any) => {
                    await tx.defaultProduct.deleteMany({})
                    await tx.clinicDefaultTemplateSync.deleteMany({ where: { templateType: 'product' } })
                    await createManyInBatches(tx.defaultProduct, mapped as any[])
                })

                return res.status(200).json({
                    success: true,
                    templateType,
                    version: nextVersion,
                    imported: mapped.length,
                    message: `Replaced default products with ${mapped.length} rows in version ${nextVersion}. Clinics will now see a new-defaults prompt.`,
                })
            }

            const mapped = rows.map((r) => mapTreatmentRow(r, nextVersion)).filter(Boolean)
            if (!mapped.length) {
                return res.status(400).json({ error: 'No valid treatment rows found in CSV' })
            }

            await prisma.$transaction(async (tx: any) => {
                await tx.defaultTreatment.deleteMany({})
                await tx.clinicDefaultTemplateSync.deleteMany({ where: { templateType: 'treatment' } })
                await createManyInBatches(tx.defaultTreatment, mapped as any[])
            })

            return res.status(200).json({
                success: true,
                templateType,
                version: nextVersion,
                imported: mapped.length,
                message: `Replaced default treatments with ${mapped.length} rows in version ${nextVersion}. Clinics will now see a new-defaults prompt.`,
            })
        } catch (error: any) {
            return res.status(500).json({ error: error?.message || 'Failed to import CSV defaults' })
        }
    }

    if (req.method === 'PUT') {
        try {
            const { page, label, values } = req.body as { page?: string; label?: string; values?: Record<string, any> }

            if (!page || !values || typeof values !== 'object') {
                return res.status(400).json({ error: 'page and values are required' })
            }

            const oldGlobal = await prisma.defaultValue.findFirst({
                where: { clinicId: null, page }
            })

            const resolvedLabel = label || oldGlobal?.label || DEFAULT_CONFIGS.find((c) => c.page === page)?.label || page

            const clinicRows = await prisma.defaultValue.findMany({
                where: {
                    page,
                    clinicId: { not: null }
                }
            })

            const clinics: Array<{ id: string }> = await prisma.clinic.findMany({ select: { id: true } })
            const existingByClinic = new Map<string, { id: number; values: any }>()
            clinicRows.forEach((row: any) => {
                if (row.clinicId) {
                    existingByClinic.set(row.clinicId, { id: row.id, values: row.values })
                }
            })

            const rowsToUpdate = oldGlobal
                ? clinicRows
                    .filter((row: any) => stableStringify(row.values) === stableStringify(oldGlobal.values))
                    .map((row: any) => row.id)
                : []

            const rowsToCreate = clinics
                .filter((clinic: { id: string }) => !existingByClinic.has(clinic.id))
                .map((clinic: { id: string }) => ({
                    clinicId: clinic.id,
                    page,
                    label: resolvedLabel,
                    values: values as any,
                }))

            const hasCategoryFieldRulesUpdate =
                Object.prototype.hasOwnProperty.call(values, 'categoryFieldRules') &&
                (page === 'prescriptions' || page === 'treatments')

            let propagatedToClinics = 0
            let createdForMissingClinics = rowsToCreate.length

            await prisma.$transaction(async (tx: any) => {
                if (oldGlobal?.id) {
                    await tx.defaultValue.update({
                        where: { id: oldGlobal.id },
                        data: {
                            label: resolvedLabel,
                            values: values as any,
                        }
                    })
                } else {
                    await tx.defaultValue.create({
                        data: {
                            clinicId: null,
                            page,
                            label: resolvedLabel,
                            values: values as any,
                        }
                    })
                }

                if (hasCategoryFieldRulesUpdate) {
                    const categoryFieldRules = (values as any).categoryFieldRules
                    for (const row of clinicRows) {
                        const currentValues = row.values && typeof row.values === 'object' && !Array.isArray(row.values)
                            ? row.values
                            : {}

                        await tx.defaultValue.update({
                            where: { id: row.id },
                            data: {
                                label: resolvedLabel,
                                values: {
                                    ...(currentValues as any),
                                    categoryFieldRules,
                                } as any,
                            },
                        })
                    }
                    propagatedToClinics = clinicRows.length
                } else if (rowsToUpdate.length > 0) {
                    await tx.defaultValue.updateMany({
                        where: { id: { in: rowsToUpdate } },
                        data: {
                            label: resolvedLabel,
                            values: values as any,
                        }
                    })
                    propagatedToClinics = rowsToUpdate.length
                }

                if (rowsToCreate.length > 0) {
                    await tx.defaultValue.createMany({ data: rowsToCreate as any[] })
                }
            })

            return res.status(200).json({
                success: true,
                updatedGlobal: true,
                propagatedToClinics,
                createdForMissingClinics,
                message: hasCategoryFieldRulesUpdate
                    ? 'Global category field rules updated for all clinics.'
                    : 'Global defaults updated. Customized clinic defaults were preserved.'
            })
        } catch (error: any) {
            return res.status(500).json({ error: error?.message || 'Failed to update global defaults' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
