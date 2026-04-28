const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')
const prisma = require('./client')

const VERSION = 1
const BATCH_SIZE = 500

function normalizeKey(key) {
    return String(key || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function normalizeValue(value) {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
}

function parseNumber(value, fallback = null) {
    if (value === undefined || value === null || String(value).trim() === '') return fallback
    const normalized = String(value).replace(/[^0-9.-]/g, '')
    if (!normalized) return fallback
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
}

function parseInteger(value, fallback = null) {
    const parsed = parseNumber(value, fallback)
    if (parsed === null || parsed === undefined) return fallback
    return Math.round(parsed)
}

function parseCsvStream(filePath, mapRow) {
    return new Promise((resolve, reject) => {
        const rows = []
        if (!fs.existsSync(filePath)) {
            return reject(new Error(`CSV file not found: ${filePath}`))
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                try {
                    const mapped = mapRow(row)
                    if (mapped) rows.push(mapped)
                } catch (err) {
                    reject(err)
                }
            })
            .on('end', () => resolve(rows))
            .on('error', (err) => reject(err))
    })
}

function getFromMap(row, keys) {
    const normalizedMap = {}
    Object.keys(row || {}).forEach((key) => {
        normalizedMap[normalizeKey(key)] = row[key]
    })

    for (const key of keys) {
        const normalizedKey = normalizeKey(key)
        if (normalizedKey in normalizedMap) {
            return normalizedMap[normalizedKey]
        }
    }

    return undefined
}

function mapProductRow(row) {
    const name = normalizeValue(getFromMap(row, ['name', 'item', 'productName', 'product name']))
    if (!name) return null

    return {
        name,
        priceRupees: parseNumber(getFromMap(row, ['priceRupees', 'rate/unit', 'rate', 'price']), 0),
        quantity: parseInteger(getFromMap(row, ['quantity', 'inventory', 'inventory(flow)', 'stock']), 0),
        purchasePriceRupees: parseNumber(getFromMap(row, ['purchasePriceRupees', 'purchaseprice/pack', 'purchasePrice', 'p/price']), 0),
        unit: normalizeValue(getFromMap(row, ['unit', 'units', 'unitType'])),
        category: normalizeValue(getFromMap(row, ['category', 'categoryName'])),
        description: normalizeValue(getFromMap(row, ['description'])),
        minStockLevel: parseInteger(getFromMap(row, ['minStockLevel', 'thresh/in', 'threshold']), 200),
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
        totalPurchased: parseInteger(getFromMap(row, ['totalPurchased', 'purchase(flow)', 'purchase']), 0),
        totalSales: parseInteger(getFromMap(row, ['totalSales', 'sales(flow)', 'sales']), 0),
        version: VERSION,
        createdAt: new Date()
    }
}

function mapTreatmentRow(row) {
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
        version: VERSION,
        createdAt: new Date()
    }
}

async function createManyInBatches(model, rows) {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        await model.createMany({ data: batch })
    }
}

async function main() {
    const productsCsvPath = path.resolve(process.cwd(), 'products.csv')
    const treatmentsCsvPath = path.resolve(process.cwd(), 'treatments.csv')

    const existingDefaults = await Promise.all([
        prisma.defaultProduct.count(),
        prisma.defaultTreatment.count()
    ])

    if (existingDefaults[0] > 0 || existingDefaults[1] > 0) {
        console.log('Default templates already exist. Seed is intended to run once and will now exit.')
        return
    }

    const [productRows, treatmentRows] = await Promise.all([
        parseCsvStream(productsCsvPath, mapProductRow),
        parseCsvStream(treatmentsCsvPath, mapTreatmentRow)
    ])

    if (productRows.length === 0 && treatmentRows.length === 0) {
        console.log('No valid rows found in CSV files. Nothing to seed.')
        return
    }

    if (productRows.length > 0) {
        await createManyInBatches(prisma.defaultProduct, productRows)
    }

    if (treatmentRows.length > 0) {
        await createManyInBatches(prisma.defaultTreatment, treatmentRows)
    }

    console.log(`Seeded ${productRows.length} default products and ${treatmentRows.length} default treatments at version ${VERSION}.`)
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
