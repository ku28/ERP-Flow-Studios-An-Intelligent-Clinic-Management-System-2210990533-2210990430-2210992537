import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import prisma from '../../../lib/prisma'
import fs from 'fs'
import path from 'path'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'POST') {
        try {
            // Get all JSON files from data directory (excluding categories, defaultValues)
            const dataDir = path.join(process.cwd(), 'data')
            const allFiles = fs.readdirSync(dataDir)
            const jsonFiles = allFiles.filter(file => 
                file.endsWith('.json') && 
                !['categories.json', 'defaultValues.json'].includes(file)
            )

            let totalImported = 0
            let totalSkipped = 0
            const results: any[] = []

            for (const fileName of jsonFiles) {
                try {
                    const categoryName = fileName.replace('.json', '')
                    const filePath = path.join(dataDir, fileName)
                    const fileContent = fs.readFileSync(filePath, 'utf-8')
                    const jsonData = JSON.parse(fileContent)

                    if (!Array.isArray(jsonData)) {
                        results.push({
                            category: categoryName,
                            status: 'skipped',
                            message: 'Invalid JSON format - not an array'
                        })
                        totalSkipped++
                        continue
                    }

                    // Get existing items for this category
                    const existingItems = await prisma.dropdownOption.findMany({
                        where: {
                            category: categoryName
                        }
                    })

                    const existingValues = new Set(
                        existingItems.map((item: { value?: string | null; label?: string | null }) => 
                            item.value?.toLowerCase() || item.label?.toLowerCase()
                        )
                    )

                    // Filter out duplicates
                    const newItems = jsonData.filter((item: any) => {
                        const itemValue = (item.value || item.name || item.label || '').toLowerCase()
                        return itemValue && !existingValues.has(itemValue)
                    })

                    if (newItems.length === 0) {
                        results.push({
                            category: categoryName,
                            status: 'skipped',
                            message: 'All items already exist',
                            existing: existingItems.length
                        })
                        totalSkipped++
                        continue
                    }

                    // Prepare items for insertion
                    const itemsToInsert = newItems.map((item: any) => ({
                        category: categoryName,
                        label: item.label || item.name || item.value || '',
                        value: item.value || item.name || item.label || ''
                    }))

                    // Insert new items
                    const inserted = await prisma.dropdownOption.createMany({
                        data: itemsToInsert,
                        skipDuplicates: true
                    })

                    results.push({
                        category: categoryName,
                        status: 'success',
                        imported: inserted.count,
                        existing: existingItems.length,
                        skipped: jsonData.length - inserted.count
                    })

                    totalImported += inserted.count

                } catch (fileError: any) {
                    results.push({
                        category: fileName.replace('.json', ''),
                        status: 'error',
                        message: fileError.message || 'Unknown error'
                    })
                    totalSkipped++
                }
            }

            return res.status(200).json({
                success: true,
                totalImported,
                totalSkipped,
                filesProcessed: jsonFiles.length,
                results
            })

        } catch (error: any) {
            return res.status(500).json({ 
                error: 'Failed to populate defaults',
                message: error.message 
            })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
