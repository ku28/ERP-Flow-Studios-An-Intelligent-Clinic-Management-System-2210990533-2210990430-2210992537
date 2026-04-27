/**
 * Script to populate DropdownOption table from JSON files
 * Run: node scripts/populate-dropdown-options.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'

interface DropdownData {
    value: string
    label: string
}

function toNonEmptyString(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text.length > 0 ? text : null
}

function normalizeDropdownData(raw: unknown, categoryName: string): DropdownData[] {
    if (!Array.isArray(raw)) {
        throw new Error(`Expected an array in ${categoryName}.json`) 
    }

    const normalized: DropdownData[] = []

    raw.forEach((item, index) => {
        // Support simple string lists like ["CARDIO", "ORTHO"]
        if (typeof item === 'string' || typeof item === 'number') {
            const text = toNonEmptyString(item)
            if (text) {
                normalized.push({ value: text, label: text })
            }
            return
        }

        // Support object lists like [{ value, label }]
        if (item && typeof item === 'object') {
            const source = item as Record<string, unknown>
            const value =
                toNonEmptyString(source.value) ??
                toNonEmptyString(source.id) ??
                toNonEmptyString(source.key) ??
                toNonEmptyString(source.name) ??
                toNonEmptyString(source.label)
            const label =
                toNonEmptyString(source.label) ??
                toNonEmptyString(source.name) ??
                value

            if (value && label) {
                normalized.push({ value, label })
                return
            }
        }

        console.warn(`⚠️  Skipping invalid item at ${categoryName}[${index}]`)
    })

    return normalized
}

function buildDatabaseUrl(raw: string | undefined): string | undefined {
    if (!raw) return raw
    try {
        const url = new URL(raw)
        if (!url.searchParams.has('connection_limit')) {
            url.searchParams.set('connection_limit', '1')
        }
        if (!url.searchParams.has('pool_timeout')) {
            url.searchParams.set('pool_timeout', '20')
        }
        return url.toString()
    } catch {
        return raw
    }
}

function createPrismaClient(): PrismaClient {
    const dbUrl = buildDatabaseUrl(process.env.DATABASE_URL || process.env.DIRECT_URL)
    if (!dbUrl) {
        throw new Error('Missing DATABASE_URL (or DIRECT_URL) for Prisma client initialization')
    }

    const pool = new Pool({ connectionString: dbUrl })
    const adapter = new PrismaPg(pool as any)

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
}

const prisma = createPrismaClient()

const categories = [
    { name: 'gender', file: 'gender.json' },
    { name: 'unitTypes', file: 'unitTypes.json' },
    { name: 'role', file: 'role.json' },
    { name: 'temperament', file: 'temperament.json' },
    { name: 'pulseDiagnosis', file: 'pulseDiagnosis.json' },
    { name: 'pulseDiagnosis2', file: 'pulseDiagnosis2.json' },
    { name: 'components', file: 'components.json' },
    { name: 'timing', file: 'timing.json' },
    { name: 'doseQuantity', file: 'doseQuantity.json' },
    { name: 'doseTiming', file: 'doseTiming.json' },
    { name: 'dilution', file: 'dilution.json' },
    { name: 'additions', file: 'additions.json' },
    { name: 'procedure', file: 'procedure.json' },
    { name: 'presentation', file: 'presentation.json' },
    { name: 'administration', file: 'administration.json' },
    { name: 'bottlePricing', file: 'bottlePricing.json' },
    { name: 'organ', file: 'organ.json' },
    { name: 'speciality', file: 'speciality.json' },
    { name: 'diseaseAction', file: 'diseaseAction.json' },
    { name: 'imbalance', file: 'imbalance.json' },
    { name: 'systems', file: 'systems.json' }
]

async function main() {
    console.log('🚀 Starting dropdown options population...\n')

    for (const category of categories) {
        try {
            const filePath = path.join(process.cwd(), 'data', category.file)
            
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️  File not found: ${category.file}`)
                continue
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8')
            const rawData = JSON.parse(fileContent)
            const data = normalizeDropdownData(rawData, category.name)

            console.log(`📦 Processing ${category.name}...`)

            // Delete existing options for this category
            await prisma.dropdownOption.deleteMany({
                where: { category: category.name }
            })

            // Insert new options
            let order = 0
            for (const item of data) {
                await prisma.dropdownOption.create({
                    data: {
                        category: category.name,
                        value: item.value,
                        label: item.label,
                        order: order++
                    }
                })
            }

            console.log(`✅ ${category.name}: ${data.length} options imported\n`)
        } catch (error) {
            console.error(`❌ Error processing ${category.name}:`, error)
        }
    }

    console.log('🎉 Dropdown options population completed!')
}

main()
    .catch((e) => {
        console.error('❌ Fatal error:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
