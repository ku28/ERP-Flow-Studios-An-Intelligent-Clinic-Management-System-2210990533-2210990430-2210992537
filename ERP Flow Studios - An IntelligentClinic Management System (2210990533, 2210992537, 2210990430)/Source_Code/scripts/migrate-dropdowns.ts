/**
 * Migration script to import dropdown data from JSON files to database
 * Run this once after deploying the new DropdownOption model
 */

import prisma from '../lib/prisma'
import fs from 'fs'
import path from 'path'

async function migrateDropdowns() {
    console.log('🔄 Starting dropdown data migration...\n')

    try {
        const dataDir = path.join(process.cwd(), 'data')
        const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'))

        let totalImported = 0
        let totalSkipped = 0

        for (const file of files) {
            const category = file.replace('.json', '')
            console.log(`📁 Processing ${category}...`)

            const filePath = path.join(dataDir, file)
            const content = fs.readFileSync(filePath, 'utf-8')
            const items = JSON.parse(content)

            if (!Array.isArray(items)) {
                console.log(`   ⚠️  Skipping ${file} - not an array`)
                continue
            }

            let imported = 0
            let skipped = 0

            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                
                // Handle two formats:
                // 1. Simple string array: ["DROPS", "DILUTIONS", ...]
                // 2. Object array: [{value: "ML", label: "ML"}, ...]
                let value: string
                let label: string

                if (typeof item === 'string') {
                    // Simple string format
                    value = item
                    label = item
                } else if (typeof item === 'object' && item !== null) {
                    // Object format with value/label
                    if (!item.value || !item.label) {
                        console.log(`   ⚠️  Skipping invalid item:`, item)
                        skipped++
                        continue
                    }
                    value = item.value
                    label = item.label
                } else {
                    console.log(`   ⚠️  Skipping invalid item:`, item)
                    skipped++
                    continue
                }

                // Skip empty values
                if (!value || value === '') {
                    console.log(`   ⏭️  Skipped empty value`)
                    skipped++
                    continue
                }

                try {
                    // Check if item already exists
                    const existing = await prisma.dropdownOption.findUnique({
                        where: {
                            category_value: {
                                category,
                                value: value
                            }
                        }
                    })

                    if (existing) {
                        console.log(`   ⏭️  Skipped: ${label} (already exists)`)
                        skipped++
                        continue
                    }

                    // Create new option
                    await prisma.dropdownOption.create({
                        data: {
                            category,
                            value: value,
                            label: label,
                            order: i
                        }
                    })

                    imported++
                    console.log(`   ✅ Imported: ${label}`)

                } catch (error: any) {
                    console.error(`   ❌ Error importing ${label}:`, error.message)
                    skipped++
                }
            }

            console.log(`   📊 ${category}: ${imported} imported, ${skipped} skipped\n`)
            totalImported += imported
            totalSkipped += skipped
        }

        console.log('✨ Migration complete!')
        console.log(`📊 Total: ${totalImported} imported, ${totalSkipped} skipped`)

    } catch (error) {
        console.error('❌ Migration failed:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

// Run migration
migrateDropdowns()
    .then(() => {
        console.log('\n✅ Done!')
        process.exit(0)
    })
    .catch((error) => {
        console.error('\n❌ Failed:', error)
        process.exit(1)
    })
